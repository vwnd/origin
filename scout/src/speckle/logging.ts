/**
 * Structured logging for the Speckle pipeline.
 *
 * One JSON object per line so Workers Logs can filter on fields
 * (`$.deliveryId`, `$.outcome`, ...) instead of substring-matching messages.
 */

export type LogFields = Record<string, unknown>;

export type Logger = {
  /** Correlates every line and the analytics data point for one delivery. */
  readonly deliveryId: string;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
};

export function createLogger(deliveryId: string, base: LogFields = {}): Logger {
  const emit =
    (level: "info" | "warn" | "error") =>
    (event: string, fields: LogFields = {}) => {
      const line = JSON.stringify({
        level,
        event,
        deliveryId,
        ...base,
        ...fields
      });
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    };

  return {
    deliveryId,
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error")
  };
}

/** Message from an unknown thrown value, safe to log. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
