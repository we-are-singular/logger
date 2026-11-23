import type { ErrorMode, LogData, LogFormat, LogLevel, LoggerOptions, RedactOption, SafeError } from "./types"

const VALID_LEVELS: ReadonlySet<string> = new Set<LogLevel>([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
])

/** Default replacement token for redacted values. */
export const DEFAULT_REDACT_CENSOR = "[REDACTED]"

const SENSITIVE_KEYS = [
  "password",
  "passphrase",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "secret",
  "clientSecret",
  "webhookSecret",
  "apiKey",
  "privateKey",
  "authorization",
  "cookie",
  "creditCard",
  "ssn",
] as const

/**
 * Default fast-redact paths covering common credential keys (top-level and one level deep)
 * as well as sensitive HTTP headers.
 */
export const DEFAULT_REDACT_PATHS: readonly string[] = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map(key => `*.${key}`),
  '["set-cookie"]',
  '*["set-cookie"]',
  "headers.authorization",
  "headers.cookie",
  'headers["set-cookie"]',
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
]

/**
 * Resolved Pino redaction configuration.
 */
export type ResolvedRedact = { paths: string[]; censor?: string; remove?: boolean } | undefined

/**
 * Normalized runtime configuration derived from options and environment variables.
 */
export interface ResolvedLoggerConfig {
  format: LogFormat
  level: LogLevel
  sync: boolean
  errorMode: ErrorMode
  redact: ResolvedRedact
}

/**
 * Parse and validate an untrusted log level string.
 */
export function parseLogLevel(value: string | undefined): LogLevel | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  return VALID_LEVELS.has(normalized) ? (normalized as LogLevel) : undefined
}

/**
 * Resolve output format using precedence:
 * `options.format` > `env.LOG_FORMAT` > `env.LOG_HUMAN` > `env.NODE_ENV === "production" ? "json" : "pretty"`.
 */
export function resolveFormat(options: LoggerOptions, env: Record<string, string | undefined>): LogFormat {
  if (options.format === "json" || options.format === "pretty") {
    return options.format
  }

  const envFormat = env.LOG_FORMAT?.trim().toLowerCase()
  if (envFormat === "json" || envFormat === "pretty") {
    return envFormat
  }

  const envHuman = env.LOG_HUMAN?.trim().toLowerCase()
  if (envHuman === "1" || envHuman === "true") {
    return "pretty"
  }
  if (envHuman === "0" || envHuman === "false") {
    return "json"
  }

  return env.NODE_ENV === "production" ? "json" : "pretty"
}

/**
 * Resolve minimum log level using precedence:
 * `options.level` > valid `env.LOG_LEVEL` > `env.NODE_ENV === "production" ? "info" : "debug"`.
 */
export function resolveLevel(options: LoggerOptions, env: Record<string, string | undefined>): LogLevel {
  const fromOption = parseLogLevel(options.level)
  if (fromOption) {
    return fromOption
  }

  const fromEnv = parseLogLevel(env.LOG_LEVEL)
  if (fromEnv) {
    return fromEnv
  }

  return env.NODE_ENV === "production" ? "info" : "debug"
}

/**
 * Resolve Pino redaction options while avoiding fast-redact's incompatible `censor` + `remove: true` pair.
 */
export function resolveRedact(redact: RedactOption | undefined): ResolvedRedact {
  if (redact === false) {
    return undefined
  }

  if (redact === undefined) {
    return {
      paths: [...DEFAULT_REDACT_PATHS],
      censor: DEFAULT_REDACT_CENSOR,
    }
  }

  if (Array.isArray(redact)) {
    return {
      paths: [...redact],
      censor: DEFAULT_REDACT_CENSOR,
    }
  }

  if (redact.remove === true) {
    return {
      paths: [...redact.paths],
      remove: true,
    }
  }

  return {
    paths: [...redact.paths],
    censor: redact.censor ?? DEFAULT_REDACT_CENSOR,
    ...(redact.remove !== undefined ? { remove: redact.remove } : {}),
  }
}

/**
 * Resolve all logger options deterministically against the provided environment map.
 */
export function resolveLoggerConfig(options: LoggerOptions = {}): ResolvedLoggerConfig {
  const env = options.env ?? process.env

  return {
    format: resolveFormat(options, env),
    level: resolveLevel(options, env),
    sync: options.sync ?? env.NODE_ENV === "test",
    errorMode: options.errorMode ?? "full",
    redact: resolveRedact(options.redact),
  }
}

/**
 * Extract only non-sensitive error metadata (`type` and optional `code`) without exposing
 * `Error.message` or stack traces that may contain credentials, SQL, or URLs.
 */
export function safeError(error: unknown): SafeError {
  if (error instanceof Error) {
    const type = error.name || error.constructor.name || "Error"
    const code = extractErrorCode(error)
    return code !== undefined ? { type, code } : { type }
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>
    let type = "UnknownError"
    if (typeof record.name === "string" && record.name.length > 0) {
      type = record.name
    } else if (typeof record.type === "string" && record.type.length > 0) {
      type = record.type
    }
    const code = extractErrorCode(record)
    return code !== undefined ? { type, code } : { type }
  }

  return { type: typeof error === "string" ? "StringError" : "UnknownError" }
}

function extractErrorCode(source: object): string | undefined {
  if (!Object.hasOwn(source, "code")) {
    return undefined
  }

  const raw = (source as { code?: unknown }).code
  if (typeof raw === "string" && raw.length > 0) {
    return raw
  }
  if (typeof raw === "number") {
    return String(raw)
  }

  return undefined
}

/**
 * Normalize runtime log data so non-object inputs and Error values never corrupt Pino's JSON output.
 */
export function normalizeLogData(data: unknown, errorMode: ErrorMode): LogData {
  if (data instanceof Error) {
    return { err: errorMode === "safe" ? safeError(data) : data }
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { value: data }
  }

  const record = data as LogData
  if (errorMode !== "safe") {
    return record
  }

  // Only allocate a shallow clone when a top-level Error property needs safe sanitization.
  let sanitized: LogData | undefined
  for (const [key, value] of Object.entries(record)) {
    if (value instanceof Error) {
      sanitized ??= { ...record }
      sanitized[key] = safeError(value)
    }
  }

  return sanitized ?? record
}
