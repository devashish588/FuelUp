// =============================================
// FuelUp - Minimal structured server logger (Phase 1)
// No secrets / no PII beyond ids. Console-backed; swap for a
// monitoring platform in a later phase without touching callers.
// =============================================

type LogContext = Record<string, string | number | boolean | undefined>;

function sanitize(context: LogContext = {}): LogContext {
  const redacted = { ...context };
  for (const key of Object.keys(redacted)) {
    if (/password|secret|token|clerk.*key|database.*url/i.test(key)) {
      redacted[key] = '[redacted]';
    }
  }
  return redacted;
}

export const logger = {
  info(message: string, context: LogContext = {}) {
    console.log(JSON.stringify({ level: 'info', message, ...sanitize(context) }));
  },
  warn(message: string, context: LogContext = {}) {
    console.warn(JSON.stringify({ level: 'warn', message, ...sanitize(context) }));
  },
  error(message: string, context: LogContext = {}) {
    console.error(JSON.stringify({ level: 'error', message, ...sanitize(context) }));
  },
};
