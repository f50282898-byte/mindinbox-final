/**
 * Structured logging — non-blocking, JSON lines, no PII.
 * Levels: debug < info < warn < error
 * Debug disabled in production.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

const isProduction = process.env.NODE_ENV === "production";
const minLevel: LogLevel = isProduction ? "info" : "debug";

const levelOrder: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[minLevel];
}

function sanitize(obj: unknown): Record<string, unknown> | undefined {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
    return undefined;
  }
  if (Array.isArray(obj)) {
    return undefined;
  }
  if (typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("password") ||
        lower.includes("secret") ||
        lower.includes("token") ||
        lower.includes("key") ||
        lower.includes("authorization") ||
        lower.includes("cookie") ||
        lower.includes("email") ||
        lower.includes("phone") ||
        lower.includes("address") ||
        lower.includes("ip")
      ) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        // skip nested objects for simplicity
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  return undefined;
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: context ? sanitize(context) : undefined,
  };
  // Use console[level] for proper devtools integration
  const out = JSON.stringify(entry);
  switch (level) {
    case "debug":
      console.debug(out);
      break;
    case "info":
      console.info(out);
      break;
    case "warn":
      console.warn(out);
      break
    case "error":
      console.error(out);
      break;
  }
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};

/** Convenience for timing operations. */
export function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  return fn().then(
    (result) => {
      log.debug(`${label} completed`, { durationMs: performance.now() - start });
      return result;
    },
    (error) => {
      log.error(`${label} failed`, { durationMs: performance.now() - start, error: String(error) });
      throw error;
    }
  );
}