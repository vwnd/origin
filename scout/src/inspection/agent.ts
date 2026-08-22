import { Agent } from "agents";
import type { IndexedObject } from "./properties";

/**
 * Per-version index of a Speckle model's data.
 *
 * One Durable Object per `versionId`: the SQLite database is scoped to a single
 * version, which makes runs isolated and the whole database disposable when the
 * run finishes. Storage is 10 GB per object — properties-only indexing of a
 * large model is nowhere near that.
 *
 * Holds **no geometry**. See `properties.ts` for how that is enforced.
 */

/**
 * SQLite in Durable Objects allows at most 100 bound parameters per query
 * (same limit as D1). The property insert binds one parameter per column, so
 * the rows-per-statement chunk is derived from that rather than guessed —
 * overshooting fails at runtime with "too many SQL variables".
 */
const MAX_BOUND_PARAMETERS = 100;
const PROPERTY_INSERT_COLUMNS = 6;
const PROPERTY_ROWS_PER_INSERT = Math.floor(
  MAX_BOUND_PARAMETERS / PROPERTY_INSERT_COLUMNS
);

export type IndexStats = {
  objects: number;
  properties: number;
};

export type TypeCount = {
  category: string | null;
  speckleType: string;
  count: number;
};

export type KeySummary = {
  keyPath: string;
  name: string;
  objects: number;
  distinctValues: number;
  units: string | null;
};

export type ValueCount = {
  value: string | null;
  count: number;
  units: string | null;
};

export class InspectionAgent extends Agent<Env> {
  /**
   * Bulk inserts go through `ctx.storage.sql` with multi-row VALUES rather than
   * the `sql` tagged template — one template call per row would be far too slow
   * for the property rows a real model produces.
   */
  private get db() {
    return this.ctx.storage.sql;
  }

  private ensureTables(): void {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS objects (" +
        "id TEXT PRIMARY KEY, speckle_type TEXT, name TEXT, category TEXT," +
        "family TEXT, type TEXT, level TEXT, application_id TEXT);"
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS properties (" +
        "object_id TEXT NOT NULL, key_path TEXT NOT NULL, name TEXT NOT NULL," +
        "value_text TEXT, value_num REAL, units TEXT);"
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_props_key ON properties(key_path);"
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_props_key_val ON properties(key_path, value_text);"
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_props_obj ON properties(object_id);"
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS run (" +
        "version_id TEXT PRIMARY KEY, project_id TEXT, status TEXT," +
        "indexed_objects INTEGER DEFAULT 0, indexed_properties INTEGER DEFAULT 0," +
        "findings_json TEXT, issue_identifier TEXT," +
        "started_at TEXT, finished_at TEXT, error TEXT);"
    );
  }

  /** Reset the index and mark a run started. Safe to call on re-delivery. */
  async beginRun(versionId: string, projectId: string): Promise<void> {
    this.ensureTables();
    this.ctx.storage.transactionSync(() => {
      this.db.exec("DELETE FROM properties;");
      this.db.exec("DELETE FROM objects;");
      this.db.exec("DELETE FROM run;");
      this.db.exec(
        "INSERT INTO run (version_id, project_id, status, started_at) VALUES (?, ?, 'indexing', ?);",
        versionId,
        projectId,
        new Date().toISOString()
      );
    });
  }

  /**
   * Insert a batch of indexed objects. Called repeatedly by the loader as it
   * streams, so the whole version is never held in memory anywhere.
   */
  async ingestBatch(batch: IndexedObject[]): Promise<IndexStats> {
    if (batch.length === 0) return { objects: 0, properties: 0 };
    this.ensureTables();

    let propertyCount = 0;
    this.ctx.storage.transactionSync(() => {
      for (const object of batch) {
        this.db.exec(
          "INSERT OR REPLACE INTO objects (id, speckle_type, name, category, family, type, level, application_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
          object.id,
          object.speckleType,
          object.name,
          object.category,
          object.family,
          object.type,
          object.level,
          object.applicationId
        );

        // Multi-row VALUES, chunked to stay under the bound-parameter cap.
        const rows = object.properties;
        for (let i = 0; i < rows.length; i += PROPERTY_ROWS_PER_INSERT) {
          const chunk = rows.slice(i, i + PROPERTY_ROWS_PER_INSERT);
          const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
          const bindings: (string | number | null)[] = [];
          for (const row of chunk) {
            bindings.push(
              object.id,
              row.keyPath,
              row.name,
              row.valueText,
              row.valueNum,
              row.units
            );
          }
          this.db.exec(
            "INSERT INTO properties (object_id, key_path, name, value_text, value_num, units) VALUES " +
              placeholders +
              ";",
            ...bindings
          );
        }
        propertyCount += rows.length;
      }
    });

    return { objects: batch.length, properties: propertyCount };
  }

  async finishRun(status: string, error?: string): Promise<void> {
    this.ensureTables();
    const stats = await this.stats();
    this.db.exec(
      "UPDATE run SET status = ?, finished_at = ?, error = ?, indexed_objects = ?, indexed_properties = ?;",
      status,
      new Date().toISOString(),
      error ?? null,
      stats.objects,
      stats.properties
    );
  }

  async stats(): Promise<IndexStats> {
    this.ensureTables();
    const objects = this.db
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM objects;")
      .one().n;
    const properties = this.db
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM properties;")
      .one().n;
    return { objects, properties };
  }

  async runState(): Promise<Record<string, unknown> | null> {
    this.ensureTables();
    return this.db.exec("SELECT * FROM run LIMIT 1;").toArray()[0] ?? null;
  }

  // ---------------------------------------------------------------------
  // Traversal surface. Aggregate-first: the model must reason over histograms,
  // never raw object dumps.
  // ---------------------------------------------------------------------

  /** What kinds of things are in this model. */
  async listObjectTypes(): Promise<TypeCount[]> {
    this.ensureTables();
    return this.db
      .exec<TypeCount>(
        "SELECT category, speckle_type AS speckleType, COUNT(*) AS count FROM objects GROUP BY category, speckle_type ORDER BY count DESC;"
      )
      .toArray();
  }

  /**
   * Candidate parameters. A high object count with a low distinct-value count
   * is enum-like — exactly where a one-off spelling variant shows up.
   */
  async listPropertyKeys(
    options: {
      category?: string | null;
      minObjects?: number;
      limit?: number;
    } = {}
  ): Promise<KeySummary[]> {
    this.ensureTables();
    const minObjects = options.minObjects ?? 2;
    const limit = Math.min(options.limit ?? 300, 1000);

    if (options.category) {
      return this.db
        .exec<KeySummary>(
          "SELECT p.key_path AS keyPath, p.name AS name, COUNT(DISTINCT p.object_id) AS objects, COUNT(DISTINCT p.value_text) AS distinctValues, MAX(p.units) AS units FROM properties p JOIN objects o ON o.id = p.object_id WHERE o.category = ? GROUP BY p.key_path, p.name HAVING objects >= ? ORDER BY objects DESC, distinctValues ASC LIMIT ?;",
          options.category,
          minObjects,
          limit
        )
        .toArray();
    }

    return this.db
      .exec<KeySummary>(
        "SELECT key_path AS keyPath, name AS name, COUNT(DISTINCT object_id) AS objects, COUNT(DISTINCT value_text) AS distinctValues, MAX(units) AS units FROM properties GROUP BY key_path, name HAVING objects >= ? ORDER BY objects DESC, distinctValues ASC LIMIT ?;",
        minObjects,
        limit
      )
      .toArray();
  }

  /**
   * Value histogram for one parameter — the workhorse. "4 HR" x500 next to
   * "4 hours" x1 makes the outlier self-evident without loading any objects.
   */
  async distinctValues(options: {
    keyPath: string;
    category?: string | null;
    limit?: number;
  }): Promise<ValueCount[]> {
    this.ensureTables();
    const limit = Math.min(options.limit ?? 200, 1000);

    if (options.category) {
      return this.db
        .exec<ValueCount>(
          "SELECT p.value_text AS value, COUNT(*) AS count, MAX(p.units) AS units FROM properties p JOIN objects o ON o.id = p.object_id WHERE p.key_path = ? AND o.category = ? GROUP BY p.value_text ORDER BY count DESC LIMIT ?;",
          options.keyPath,
          options.category,
          limit
        )
        .toArray();
    }

    return this.db
      .exec<ValueCount>(
        "SELECT value_text AS value, COUNT(*) AS count, MAX(units) AS units FROM properties WHERE key_path = ? GROUP BY value_text ORDER BY count DESC LIMIT ?;",
        options.keyPath,
        limit
      )
      .toArray();
  }

  /** Drill-down: a few concrete objects carrying a given value. */
  async sampleObjects(options: {
    keyPath?: string;
    value?: string;
    category?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    this.ensureTables();
    const limit = Math.min(options.limit ?? 5, 25);

    if (options.keyPath && options.value !== undefined) {
      return this.db
        .exec(
          "SELECT o.id, o.name, o.category, o.family, o.type, o.level FROM objects o JOIN properties p ON p.object_id = o.id WHERE p.key_path = ? AND p.value_text = ? LIMIT ?;",
          options.keyPath,
          options.value,
          limit
        )
        .toArray();
    }

    if (options.category) {
      return this.db
        .exec(
          "SELECT id, name, category, family, type, level FROM objects WHERE category = ? LIMIT ?;",
          options.category,
          limit
        )
        .toArray();
    }

    return this.db
      .exec(
        "SELECT id, name, category, family, type, level FROM objects LIMIT ?;",
        limit
      )
      .toArray();
  }

  /** Chase a suspected typo across every parameter value. */
  async searchValues(options: {
    pattern: string;
    limit?: number;
  }): Promise<{ keyPath: string; value: string | null; count: number }[]> {
    this.ensureTables();
    const limit = Math.min(options.limit ?? 100, 500);
    return this.db
      .exec<{ keyPath: string; value: string | null; count: number }>(
        "SELECT key_path AS keyPath, value_text AS value, COUNT(*) AS count FROM properties WHERE value_text LIKE ? COLLATE NOCASE GROUP BY key_path, value_text ORDER BY count DESC LIMIT ?;",
        "%" + options.pattern + "%",
        limit
      )
      .toArray();
  }

  /**
   * Scope guard: asserts the index holds no geometry. Used by Stage A
   * verification — a failure here means the exclusion rules have a hole.
   */
  async assertNoGeometry(): Promise<{
    longValues: number;
    nonDataObjectTypes: string[];
    longestValueSample: string | null;
  }> {
    this.ensureTables();
    const longValues = this.db
      .exec<{ n: number }>(
        "SELECT COUNT(*) AS n FROM properties WHERE LENGTH(value_text) > 200;"
      )
      .one().n;
    const nonDataObjectTypes = this.db
      .exec<{ speckle_type: string }>(
        "SELECT DISTINCT speckle_type FROM objects WHERE speckle_type NOT LIKE '%Objects.Data.DataObject%';"
      )
      .toArray()
      .map((row) => row.speckle_type);
    const longest = this.db
      .exec<{ value_text: string | null }>(
        "SELECT value_text FROM properties ORDER BY LENGTH(value_text) DESC LIMIT 1;"
      )
      .toArray()[0];
    return {
      longValues,
      nonDataObjectTypes,
      longestValueSample: longest?.value_text?.slice(0, 200) ?? null
    };
  }
}
