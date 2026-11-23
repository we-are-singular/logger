import { types } from "node:util"
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
  "access_token",
  "refreshToken",
  "refresh_token",
  "idToken",
  "id_token",
  "secret",
  "clientSecret",
  "client_secret",
  "webhookSecret",
  "webhook_secret",
  "apiKey",
  "api_key",
  "privateKey",
  "private_key",
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "creditCard",
  "credit_card",
  "ssn",
] as const

const SENSITIVE_HYPHENATED_KEYS = [
  "set-cookie",
  "Set-Cookie",
  "x-api-key",
  "X-Api-Key",
  "proxy-authorization",
  "Proxy-Authorization",
] as const

/**
 * Default fast-redact paths covering common credential keys (camelCase and snake_case, top-level
 * and one level deep) as well as sensitive lowercase and Title-Case HTTP headers.
 */
export const DEFAULT_REDACT_PATHS: readonly string[] = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map(key => `*.${key}`),
  ...SENSITIVE_HYPHENATED_KEYS.map(key => `["${key}"]`),
  ...SENSITIVE_HYPHENATED_KEYS.map(key => `*["${key}"]`),
  "req.headers.authorization",
  "req.headers.Authorization",
  "req.headers.cookie",
  "req.headers.Cookie",
  'req.headers["x-api-key"]',
  'req.headers["X-Api-Key"]',
  'req.headers["proxy-authorization"]',
  'req.headers["Proxy-Authorization"]',
  'res.headers["set-cookie"]',
  'res.headers["Set-Cookie"]',
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
 * Check whether an unknown value is an Error instance (including cross-realm native errors).
 */
export function isErrorInstance(value: unknown): value is Error {
  return value instanceof Error || types.isNativeError(value)
}

/**
 * Check whether an unknown value is a non-null, non-array record object
 * (excluding built-in value objects such as `Date`, `RegExp`, `Map`, `Set`, and typed arrays/`Buffer`).
 * Callers must check {@link isErrorInstance} separately before calling this helper.
 */
export function isPlainObject(value: unknown): value is LogData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }

  return !(
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    ArrayBuffer.isView(value)
  )
}

/**
 * Extract only non-sensitive error metadata (`type` and optional `code`) without exposing
 * `Error.message` or stack traces that may contain credentials, SQL, or URLs.
 */
export function safeError(error: unknown): SafeError {
  if (isErrorInstance(error)) {
    const ctorName = typeof error.constructor?.name === "string" ? error.constructor.name : ""
    const type = error.name || ctorName || "Error"
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

/**
 * Pino serializer for `errorMode: "safe"` that preserves non-error primitives (`null`, `undefined`,
 * `boolean`, `number`) untouched like `pino.stdSerializers.err`, while sanitizing errors and objects.
 */
export function serializeSafeError(value: unknown): unknown {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") {
    return value
  }
  return safeError(value)
}

function extractErrorCode(source: object): string | undefined {
  try {
    if (!("code" in source)) {
      return undefined
    }

    const raw = (source as { code?: unknown }).code
    if (typeof raw === "string" && raw.length > 0) {
      return raw
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return String(raw)
    }
  } catch {
    // Never throw from a getter while logging an error.
  }

  return undefined
}

/**
 * Recursively sanitize nested `Error` instances across plain objects and arrays using copy-on-write
 * cloning so payloads without errors incur zero extra allocations. Cycle-safe via `WeakSet`.
 */
export function sanitizeSafeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (isErrorInstance(value)) {
    return safeError(value)
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]"
    }
    seen.add(value)
    let cloned: unknown[] | undefined
    for (let i = 0; i < value.length; i += 1) {
      const item = value[i]
      const next = sanitizeSafeValue(item, seen)
      if (next !== item) {
        cloned ??= [...value]
        cloned[i] = next
      }
    }
    seen.delete(value)
    return cloned ?? value
  }

  if (!isPlainObject(value)) {
    return value
  }

  if (seen.has(value)) {
    return "[Circular]"
  }
  seen.add(value)

  let sanitized: LogData | undefined
  for (const [key, item] of Object.entries(value)) {
    const next = sanitizeSafeValue(item, seen)
    if (next !== item) {
      sanitized ??= { ...value }
      sanitized[key] = next
    }
  }

  seen.delete(value)
  return sanitized ?? value
}

/**
 * Sanitize all nested `Error` values inside a record when `errorMode === "safe"`.
 */
export function sanitizeSafeRecord(record: LogData): LogData {
  return sanitizeSafeValue(record) as LogData
}

/**
 * Normalize runtime log data so non-object inputs and Error values never corrupt Pino's JSON output.
 */
export function normalizeLogData(data: unknown, errorMode: ErrorMode): LogData {
  if (isErrorInstance(data)) {
    return { err: errorMode === "safe" ? safeError(data) : data }
  }

  if (!isPlainObject(data)) {
    return { value: errorMode === "safe" ? sanitizeSafeValue(data) : data }
  }

  if (errorMode !== "safe") {
    return data
  }

  return sanitizeSafeRecord(data)
}
