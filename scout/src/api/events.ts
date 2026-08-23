import { Agent } from "agents";

/**
 * Fan-out of pipeline events to connected browsers.
 *
 * The UI wants to react to "a version was published" and "a run finished". It
 * cannot subscribe to Speckle directly — that would need the PAT in the
 * browser — but the Worker already receives those webhooks, so the events are
 * relayed from here instead. Same signal, no credential exposure, and it
 * carries our own pipeline events too, which Speckle knows nothing about.
 *
 * A single instance (name `global`) holds every connection. Hibernation keeps
 * that cheap: sockets survive the object being evicted between events.
 */

export type ScoutEvent =
  | {
      type: "version_published";
      projectId: string;
      versionId: string;
      modelName: string | null;
      instanceId: string | null;
      at: string;
    }
  | {
      type: "run_progress";
      instanceId: string;
      versionId: string;
      step: string;
      detail?: Record<string, unknown>;
      at: string;
    }
  | {
      type: "run_complete";
      instanceId: string;
      versionId: string;
      outcome: string;
      findings: number;
      deltas: number;
      /** Comma-joined when several scouts each filed an issue on this run. */
      issueIdentifier: string | null;
      at: string;
    }
  | {
      type: "run_failed";
      instanceId: string;
      versionId: string;
      error: string;
      at: string;
    }
  | {
      type: "issue_synced";
      projectId: string;
      issueId: string | null;
      identifier: string | null;
      title: string | null;
      at: string;
    };

export class EventsAgent extends Agent<Env> {
  /** Last few events, so a page that loads mid-run is not blank. */
  private recent: ScoutEvent[] = [];

  onConnect(connection: { send: (message: string) => void }) {
    if (this.recent.length === 0) return;
    connection.send(JSON.stringify({ type: "backlog", events: this.recent }));
  }

  /**
   * Called over RPC from the webhook handler and the workflow. Broadcasting
   * from a single well-known instance keeps every browser in step without the
   * publisher needing to know who is listening.
   */
  async publish(event: ScoutEvent): Promise<void> {
    this.recent = [...this.recent, event].slice(-20);
    this.broadcast(JSON.stringify(event));
  }
}

/** Fire-and-forget: a dropped notification must never fail the pipeline. */
export async function publishEvent(env: Env, event: ScoutEvent): Promise<void> {
  try {
    const id = env.EventsAgent.idFromName("global");
    await env.EventsAgent.get(id).publish(event);
  } catch {
    // Deliberately swallowed — the run is what matters, not the toast.
  }
}
