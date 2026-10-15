export interface DiscoveryErrorDiagnostic {
  readonly message: string;
  readonly code?: string;
}

const MAX_DIAGNOSTICS = 8;

// Codes and explanations are both fixed: even a well-formed unknown code may contain private data.
const driverMessages = new Map<string, string>([
  ["ECONNREFUSED", "Database connection refused"],
  ["ECONNRESET", "Database connection reset"],
  ["ETIMEDOUT", "Database connection timed out"],
  ["ENOTFOUND", "Database hostname could not be resolved"],
  ["EAI_AGAIN", "Database hostname lookup temporarily failed"],
  ["ENETUNREACH", "Database network is unreachable"],
  ["EHOSTUNREACH", "Database host is unreachable"],
  ["08001", "Unable to establish a database connection"],
  ["08006", "Database connection failure"],
  ["53300", "Too many database connections"],
  ["57P01", "Database connection terminated by an administrator"],
  ["57P03", "Database is not accepting connections"],
  ["28P01", "Database password authentication failed"],
  ["28000", "Database authorization failed"],
  ["42501", "Insufficient database permissions"],
  ["42P01", "Database table does not exist"],
  ["42703", "Database column does not exist"],
  ["42883", "Database function does not exist"],
  ["42601", "Database query syntax error"],
  ["22P02", "Invalid database input representation"],
  ["57014", "Database query was cancelled"],
  ["XX000", "Database internal error"],
  ["SELF_SIGNED_CERT_IN_CHAIN", "self-signed certificate in certificate chain"],
  ["DEPTH_ZERO_SELF_SIGNED_CERT", "self-signed certificate"],
  ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "unable to verify the first certificate"],
  ["UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "unable to get local issuer certificate"],
  ["CERT_HAS_EXPIRED", "certificate has expired"],
  ["CERT_NOT_YET_VALID", "certificate is not yet valid"],
  ["ERR_TLS_CERT_ALTNAME_INVALID", "Database TLS certificate does not match the hostname"],
]);

// Some pg/pooler failures have no specific code. Match complete known text, never prefixes.
const safeMessages = new Map([
  "Route dependencies could not be loaded",
  "Session discovery is not available yet",
  "Tenant or user not found",
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
  "timeout expired",
  "Connection terminated",
  "Connection terminated unexpectedly",
  "Query read timeout",
  "The server does not support SSL connections",
  "There was an error establishing an SSL connection",
  "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string",
  "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string",
].map((message) => [message, message]));

/** Select a fixed public explanation; unknown codes and text never pass through. */
function publicDiagnostic(message: unknown, code?: unknown): DiscoveryErrorDiagnostic {
  const driverMessage = typeof code === "string" ? driverMessages.get(code) : undefined;
  const safeMessage = typeof message === "string" ? safeMessages.get(message) : undefined;
  return {
    message: safeMessage ?? driverMessage ?? "Unknown error",
    ...(driverMessage && typeof code === "string" ? { code } : {}),
  };
}

/** Collect up to eight allowlisted diagnostics from exception, cause and aggregate failures. */
export function discoveryErrorDiagnostics(error: unknown): DiscoveryErrorDiagnostic[] {
  const diagnostics: DiscoveryErrorDiagnostic[] = [];
  const seen = new Set<object>();
  const pending: unknown[] = [error];
  while (pending.length > 0 && diagnostics.length < MAX_DIAGNOSTICS) {
    const current = pending.shift();
    if (current === null || typeof current !== "object") {
      diagnostics.push(publicDiagnostic(current));
      continue;
    }
    if (seen.has(current)) continue;
    seen.add(current);
    diagnostics.push(publicDiagnostic(
      "message" in current ? current.message : undefined,
      "code" in current ? current.code : undefined,
    ));
    if ("cause" in current && current.cause !== undefined) pending.push(current.cause);
    if (current instanceof AggregateError) pending.push(...current.errors.slice(0, MAX_DIAGNOSTICS));
  }
  return diagnostics;
}
