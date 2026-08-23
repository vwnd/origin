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
const PROPERTY_INSERT_COLUMNS = 7;
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

/**
 * Bumped whenever the table shape changes.
 *
 * `CREATE TABLE IF NOT EXISTS` silently leaves an existing table alone, so an
 * object created under an older shape would keep it and every insert would fail
 * with "table properties has no column named ...". The index is disposable —
 * rebuilt from Speckle per version — so the correct response to a mismatch is
 * to drop and recreate rather than migrate in place.
 */
const SCHEMA_VERSION = 3;

/**
 * Frontier row lifecycle for the selective walk. The table doubles as the
 * dedupe set: rows are never deleted during a run, so an id that was already
 * fetched (or is in flight) can never be enqueued twice.
 */
const FRONTIER_PENDING = 0;
const FRONTIER_CLAIMED = 1;
const FRONTIER_DONE = 2;

export class InspectionAgent extends Agent<Env> {
  /**
   * Bulk inserts go through `ctx.storage.sql` with multi-row VALUES rather than
   * the `sql` tagged template — one template call per row would be far too slow
   * for the property rows a real model produces.
   */
  private get db() {
    return this.ctx.storage.sql;
  }

  private schemaChecked = false;

  private ensureTables(): void {
    if (this.schemaChecked) return;

    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);"
    );
    const current =
      this.db
        .exec<{ version: number }>("SELECT version FROM schema_meta LIMIT 1;")
        .toArray()[0]?.version ?? 0;

    if (current !== SCHEMA_VERSION) {
      // Stale or absent shape: start clean. Nothing here is a source of truth.
      this.db.exec("DROP TABLE IF EXISTS properties;");
      this.db.exec("DROP TABLE IF EXISTS objects;");
      this.db.exec("DROP TABLE IF EXISTS run;");
      this.db.exec("DROP TABLE IF EXISTS frontier;");
      this.db.exec("DELETE FROM schema_meta;");
      this.db.exec(
        "INSERT INTO schema_meta (version) VALUES (?);",
        SCHEMA_VERSION
      );
    }

    this.db.exec(
      "CREATE TABLE IF NOT EXISTS objects (" +
        "id TEXT PRIMARY KEY, speckle_type TEXT, name TEXT, category TEXT," +
        "family TEXT, type TEXT, level TEXT, application_id TEXT);"
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS properties (" +
        "object_id TEXT NOT NULL, key_path TEXT NOT NULL, name TEXT NOT NULL," +
        "value_text TEXT, value_num REAL, units TEXT," +
        // Addresses the parameter in a write-back delta. Never null: rows
        // without one are dropped at index time as non-editable.
        "internal_definition_name TEXT NOT NULL DEFAULT '');"
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
    // The selective walk's work queue and dedupe set in one. Durable here
    // because the frontier can exceed the 1 MiB workflow step-result cap.
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS frontier (" +
        "id TEXT PRIMARY KEY, state INTEGER NOT NULL DEFAULT 0);"
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_frontier_state ON frontier(state);"
    );

    this.schemaChecked = true;
  }

  /** Reset the index and mark a run started. Safe to call on re-delivery. */
  async beginRun(versionId: string, projectId: string): Promise<void> {
    this.ensureTables();
    this.ctx.storage.transactionSync(() => {
      this.db.exec("DELETE FROM properties;");
      this.db.exec("DELETE FROM objects;");
      this.db.exec("DELETE FROM run;");
      this.db.exec("DELETE FROM frontier;");
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
          const placeholders = chunk
            .map(() => "(?, ?, ?, ?, ?, ?, ?)")
            .join(",");
          const bindings: (string | number | null)[] = [];
          for (const row of chunk) {
            bindings.push(
              object.id,
              row.keyPath,
              row.name,
              row.valueText,
              row.valueNum,
              row.units,
              row.internalDefinitionName
            );
          }
          this.db.exec(
            "INSERT INTO properties (object_id, key_path, name, value_text, value_num, units, internal_definition_name) VALUES " +
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

  // ---------------------------------------------------------------------
  // Frontier for the selective walk (see walker.ts). One workflow drives one
  // version's agent, so claims never race; the states exist so a retried
  // step re-reads exactly the slice its dead predecessor was working on.
  // ---------------------------------------------------------------------

  /** Add ids not seen before this run. Idempotent: re-adding is a no-op. */
  async enqueueFrontier(ids: string[]): Promise<number> {
    this.ensureTables();
    if (ids.length === 0) return 0;

    let added = 0;
    this.ctx.storage.transactionSync(() => {
      for (let i = 0; i < ids.length; i += MAX_BOUND_PARAMETERS) {
        const chunk = ids.slice(i, i + MAX_BOUND_PARAMETERS);
        const placeholders = chunk
          .map(() => `(?, ${FRONTIER_PENDING})`)
          .join(",");
        const result = this.db.exec(
          "INSERT OR IGNORE INTO frontier (id, state) VALUES " +
            placeholders +
            ";",
          ...chunk
        );
        added += result.rowsWritten;
      }
    });
    return added;
  }

  /**
   * Ids for the next walk chunk. Previously claimed but never completed ids
   * come back first — that is the retry path — topped up from pending.
   */
  async claimFrontier(limit: number): Promise<string[]> {
    this.ensureTables();
    const claimed = this.db
      .exec<{ id: string }>(
        "SELECT id FROM frontier WHERE state = ? LIMIT ?;",
        FRONTIER_CLAIMED,
        limit
      )
      .toArray()
      .map((row) => row.id);

    const topUp = limit - claimed.length;
    if (topUp > 0) {
      this.db.exec(
        "UPDATE frontier SET state = ? WHERE id IN " +
          "(SELECT id FROM frontier WHERE state = ? LIMIT ?);",
        FRONTIER_CLAIMED,
        FRONTIER_PENDING,
        topUp
      );
      return this.db
        .exec<{ id: string }>(
          "SELECT id FROM frontier WHERE state = ? LIMIT ?;",
          FRONTIER_CLAIMED,
          limit
        )
        .toArray()
        .map((row) => row.id);
    }
    return claimed;
  }

  /** Mark the claimed slice done. Called once its chunk fully succeeded. */
  async completeClaimed(): Promise<void> {
    this.ensureTables();
    this.db.exec(
      "UPDATE frontier SET state = ? WHERE state = ?;",
      FRONTIER_DONE,
      FRONTIER_CLAIMED
    );
  }

  /** Ids still to fetch: pending plus any claimed-but-unfinished slice. */
  async frontierRemaining(): Promise<number> {
    this.ensureTables();
    return this.db
      .exec<{ n: number }>(
        "SELECT COUNT(*) AS n FROM frontier WHERE state != ?;",
        FRONTIER_DONE
      )
      .one().n;
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
      /** Exclude parameters holding numeric values — text vocabularies only. */
      textOnly?: boolean;
    } = {}
  ): Promise<KeySummary[]> {
    this.ensureTables();
    const minObjects = options.minObjects ?? 2;
    const limit = Math.min(options.limit ?? 300, 1000);
    const textGuard = options.textOnly
      ? " AND SUM(CASE WHEN p.value_num IS NOT NULL THEN 1 ELSE 0 END) = 0"
      : "";

    if (options.category) {
      return this.db
        .exec<KeySummary>(
          "SELECT p.key_path AS keyPath, p.name AS name, COUNT(DISTINCT p.object_id) AS objects, COUNT(DISTINCT p.value_text) AS distinctValues, MAX(p.units) AS units FROM properties p JOIN objects o ON o.id = p.object_id WHERE o.category = ? GROUP BY p.key_path, p.name HAVING objects >= ?" +
            textGuard +
            " ORDER BY objects DESC, distinctValues ASC LIMIT ?;",
          options.category,
          minObjects,
          limit
        )
        .toArray();
    }

    return this.db
      .exec<KeySummary>(
        "SELECT p.key_path AS keyPath, p.name AS name, COUNT(DISTINCT p.object_id) AS objects, COUNT(DISTINCT p.value_text) AS distinctValues, MAX(p.units) AS units FROM properties p GROUP BY p.key_path, p.name HAVING objects >= ?" +
          textGuard +
          " ORDER BY objects DESC, distinctValues ASC LIMIT ?;",
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

  /**
   * Parameters worth asking a model about, chosen in SQL rather than by the
   * model itself.
   *
   * This is the whole cost story: candidate selection is a deterministic query,
   * so it costs nothing, and each parameter can then be judged by a small
   * independent request instead of one long conversation that re-reads its own
   * history every turn.
   *
   * The filter encodes what "enum-like" means — the shape in which a one-off
   * misspelling is detectable:
   *  - enough objects that a majority exists to compare against
   *  - at least two distinct values, or there is nothing to compare
   *  - few enough distinct values that it is a vocabulary, not an identifier
   *  - no numeric values, since areas and lengths vary by design
   *  - a low distinct-to-object ratio, which excludes marks and room names
   */
  async listCandidateParameters(
    options: {
      minObjects?: number;
      maxDistinct?: number;
      maxDistinctRatio?: number;
      limit?: number;
    } = {}
  ): Promise<
    {
      keyPath: string;
      name: string;
      objects: number;
      distinctValues: number;
      internalDefinitionName: string;
    }[]
  > {
    this.ensureTables();
    const minObjects = options.minObjects ?? 5;
    // Name-like parameters are legitimately high-cardinality and that is exactly
    // where misspellings hide: `Type Name` has 356 distinct values and held
    // three real findings ("Insultation" x111, "Terrazo", a doubled inch mark).
    // Any cap low enough to mean "enum-like" excludes them, so the ceiling is
    // only a runaway guard — `maxDistinctRatio` is what actually rejects
    // identifiers, and it keeps Type Name at a ratio of 0.05. Long value lists
    // are split across several requests rather than dropped.
    const maxDistinct = options.maxDistinct ?? 2000;
    const maxDistinctRatio = options.maxDistinctRatio ?? 0.6;
    const limit = Math.min(options.limit ?? 250, 500);

    return this.db
      .exec<{
        keyPath: string;
        name: string;
        objects: number;
        distinctValues: number;
        internalDefinitionName: string;
      }>(
        "SELECT key_path AS keyPath, name AS name," +
          " COUNT(DISTINCT object_id) AS objects," +
          " COUNT(DISTINCT value_text) AS distinctValues," +
          " MAX(internal_definition_name) AS internalDefinitionName" +
          " FROM properties GROUP BY key_path, name" +
          " HAVING objects >= ? AND distinctValues >= 2 AND distinctValues <= ?" +
          " AND SUM(CASE WHEN value_num IS NOT NULL THEN 1 ELSE 0 END) = 0" +
          " AND (distinctValues * 1.0 / objects) <= ?" +
          " ORDER BY objects DESC LIMIT ?;",
        minObjects,
        maxDistinct,
        maxDistinctRatio,
        limit
      )
      .toArray();
  }

  /**
   * Histograms for a set of parameters in one round trip, so judging N
   * parameters does not mean N+1 calls into this object.
   */
  async histogramsFor(
    keyPaths: string[],
    valuesPerKey = 400
  ): Promise<Record<string, ValueCount[]>> {
    this.ensureTables();
    if (keyPaths.length === 0) return {};

    const out: Record<string, ValueCount[]> = {};
    // Chunked to stay under the 100 bound-parameter cap.
    for (let i = 0; i < keyPaths.length; i += 90) {
      const chunk = keyPaths.slice(i, i + 90);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = this.db
        .exec<{
          keyPath: string;
          value: string | null;
          count: number;
          units: string | null;
        }>(
          "SELECT key_path AS keyPath, value_text AS value, COUNT(*) AS count," +
            " MAX(units) AS units FROM properties WHERE key_path IN (" +
            placeholders +
            ") GROUP BY key_path, value_text ORDER BY count DESC;",
          ...chunk
        )
        .toArray();

      for (const row of rows) {
        const bucket = (out[row.keyPath] ??= []);
        if (bucket.length < valuesPerKey) {
          bucket.push({ value: row.value, count: row.count, units: row.units });
        }
      }
    }

    return out;
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

  /**
   * Every object carrying a given value for a parameter, with the identifiers a
   * write-back delta needs.
   *
   * A finding states "these values are wrong"; a delta has to name each object
   * individually, so this is what turns one into the other.
   */
  async objectsWithValue(options: {
    keyPath: string;
    value: string;
    /** Restrict to one object category — a category-scoped finding must not
     *  produce edits on other categories that share the same value. */
    category?: string | null;
    limit?: number;
  }): Promise<
    {
      objectId: string;
      applicationId: string | null;
      internalDefinitionName: string;
      name: string | null;
      category: string | null;
    }[]
  > {
    this.ensureTables();
    const limit = Math.min(options.limit ?? 500, 2000);
    const categoryGuard = options.category ? " AND o.category = ?" : "";
    const bindings: (string | number)[] = [options.keyPath, options.value];
    if (options.category) bindings.push(options.category);
    bindings.push(limit);
    return this.db
      .exec<{
        objectId: string;
        applicationId: string | null;
        internalDefinitionName: string;
        name: string | null;
        category: string | null;
      }>(
        "SELECT o.id AS objectId, o.application_id AS applicationId," +
          " p.internal_definition_name AS internalDefinitionName," +
          " o.name AS name, o.category AS category" +
          " FROM properties p JOIN objects o ON o.id = p.object_id" +
          " WHERE p.key_path = ? AND p.value_text = ?" +
          categoryGuard +
          " AND o.application_id IS NOT NULL" +
          " AND p.internal_definition_name <> ''" +
          " LIMIT ?;",
        ...bindings
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
