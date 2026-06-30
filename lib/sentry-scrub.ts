import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const SENSITIVE_KEY = /email|password|token|authorization|cookie|session|secret|api[_-]?key|refresh|access/i;

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.includes("@") && value.includes(".")) return "[email]";
    if (value.length > 40 && /^[A-Za-z0-9._-]+$/.test(value)) return "[token]";
    return value.slice(0, 500);
  }
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") return scrubObject(value as Record<string, unknown>);
  return value;
}

function scrubObject(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = scrubValue(value);
    }
  }
  return out;
}

export function sentryBeforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.user) {
    event.user = { id: event.user.id };
  }
  if (event.request?.headers) {
    event.request.headers = scrubObject(event.request.headers as Record<string, unknown>) as typeof event.request.headers;
  }
  if (event.extra) {
    event.extra = scrubObject(event.extra as Record<string, unknown>);
  }
  if (event.contexts) {
    event.contexts = scrubObject(event.contexts as Record<string, unknown>) as typeof event.contexts;
  }
  return event;
}
