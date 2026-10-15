export interface DiscoveryErrorDiagnostic {
  readonly message: string;
  readonly code?: string;
}

const REDACTED = "[REDACTED]";
const MAX_DIAGNOSTICS = 8;
const sensitiveSetting = /(?:^|_)(?:PASSWORD|PASS|SECRET|TOKEN|KEY|CREDENTIALS?|URL|URI)(?:_|$)|^PG(?:PASSWORD|USER)$/i;

function configuredSecrets(environment: Readonly<Record<string, string | undefined>>): string[] {
  const secrets = new Set<string>();
  const add = (value: string) => {
    if (!value) return;
    secrets.add(value);
    secrets.add(encodeURIComponent(value));
    secrets.add(JSON.stringify(value).slice(1, -1));
    try { secrets.add(decodeURIComponent(value)); } catch { /* Not every password is URI-encoded. */ }
  };
  for (const [name, value] of Object.entries(environment)) {
    if (!value || !sensitiveSetting.test(name)) continue;
    add(value);
    try {
      const url = new URL(value);
      add(url.username);
      add(url.password);
      add(url.hostname);
      // PostgreSQL connection parameters may override authority credentials.
      for (const [key, parameter] of url.searchParams) {
        if (/^(?:user|password|pass|token|secret|key|api_key)$/i.test(key)) add(parameter);
      }
    } catch { /* Most settings are individual credentials, not URLs. */ }
  }
  return [...secrets].filter(Boolean).sort((a, b) => b.length - a.length);
}

function redact(message: string, secrets: readonly string[]): string {
  // Reject oversized input rather than cutting a credential before redaction can recognize it.
  if (message.length > 16_000) return "Error message omitted because it is too long";
  const spans: { start: number; end: number }[] = [];
  // Find every sensitive span in the original text. Replacing a short username first
  // could otherwise break a URL scheme or credential label and expose its value.
  for (const secret of secrets) {
    let start = message.indexOf(secret);
    while (start !== -1) {
      spans.push({ start, end: start + secret.length });
      start = message.indexOf(secret, start + secret.length);
    }
  }
  const maskMatches = (pattern: RegExp, keepPrefix = false) => {
    for (const match of message.matchAll(pattern)) {
      spans.push({
        start: match.index + (keepPrefix ? match[1]?.length ?? 0 : 0),
        end: match.index + match[0].length,
      });
    }
  };
  maskMatches(/\b[a-z][a-z\d+.-]*:\/\/[^\s"'`<>]+/gi);
  maskMatches(/"(?:\\.|[^"\\])*(?:"|$)|(?<!\w)'(?:\\.|[^'\\])*(?:'|$)|`(?:\\.|[^`\\])*(?:`|$)/g);
  maskMatches(/\b(authorization\s*[=:]\s*(?:(?:Bearer|Basic)\s+)?)[^\s;,]+/gi, true);
  maskMatches(/\b((?:Bearer|Basic)\s+)[^\s;,]+/gi, true);
  maskMatches(/\b((?:[\w.-]*[_-])?(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*)[^\s;,]+/gi, true);
  maskMatches(/\b(cookie\s*[=:])[^\r\n]*/gi, true);
  maskMatches(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g);

  const merged: typeof spans = [];
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  let result = "";
  let position = 0;
  for (const span of merged) {
    result += message.slice(position, span.start) + REDACTED;
    position = span.end;
  }
  result += message.slice(position);
  // Exception messages can embed stack/SQL continuations; only return the first line.
  return (result.split(/[\r\n]/, 1)[0]?.trim() || "Unknown error").slice(0, 500);
}

/** Best-effort redaction for public diagnostics; never serialize arbitrary error properties. */
export function discoveryErrorDiagnostics(
  error: unknown,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DiscoveryErrorDiagnostic[] {
  const secrets = configuredSecrets(environment);
  const diagnostics: DiscoveryErrorDiagnostic[] = [];
  const seen = new Set<object>();
  const pending: unknown[] = [error];
  while (pending.length > 0 && diagnostics.length < MAX_DIAGNOSTICS) {
    const current = pending.shift();
    if (current === null || typeof current !== "object") {
      diagnostics.push({ message: redact(typeof current === "string" ? current : "Unknown error", secrets) });
      continue;
    }
    if (seen.has(current)) continue;
    seen.add(current);
    const message = "message" in current && typeof current.message === "string" ? current.message : "Unknown error";
    const code = "code" in current && typeof current.code === "string" ? redact(current.code, secrets) : undefined;
    diagnostics.push({
      message: redact(message, secrets),
      ...(code && /^[A-Z0-9_]{2,64}$/.test(code) ? { code } : {}),
    });
    if ("cause" in current && current.cause !== undefined) pending.push(current.cause);
    if (current instanceof AggregateError) pending.push(...current.errors.slice(0, MAX_DIAGNOSTICS));
  }
  return diagnostics;
}
