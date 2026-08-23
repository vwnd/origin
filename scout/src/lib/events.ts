import { useEffect, useRef, useState } from "react";

/**
 * Live pipeline events, relayed by the Worker.
 *
 * The browser cannot subscribe to Speckle directly — that needs the PAT — so
 * the Worker receives the webhook and re-broadcasts it here, along with our own
 * run events, which Speckle knows nothing about.
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

type Options = { onEvent: (event: ScoutEvent) => void };

/**
 * Connects to the events socket and reconnects with backoff.
 *
 * `onEvent` is held in a ref so a caller can pass an inline closure without
 * tearing down and re-establishing the socket on every render.
 */
export function useScoutEvents({ onEvent }: Options) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onEvent);

  // Assigned in an effect, not during render: writing a ref while rendering is
  // a side effect, and the socket only reads it later from its own callbacks.
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      if (closed) return;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(
        `${protocol}//${location.host}/agents/events-agent/global`
      );

      socket.onopen = () => {
        retry = 0;
        setConnected(true);
      };

      socket.onmessage = (message) => {
        try {
          const parsed = JSON.parse(message.data as string);
          // A page opened mid-run gets what it missed.
          if (parsed?.type === "backlog" && Array.isArray(parsed.events)) {
            for (const event of parsed.events) handlerRef.current(event);
            return;
          }
          if (parsed?.type) handlerRef.current(parsed as ScoutEvent);
        } catch {
          // Not one of ours — the Agents SDK sends its own control frames.
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, 500 * 2 ** retry);
      };

      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, []);

  return { connected };
}
