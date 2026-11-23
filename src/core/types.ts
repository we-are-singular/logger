import type { DestinationStream } from "pino"

/**
 * Supported Pino log levels, including `"silent"` to disable all output.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent"

/**
 * Active log levels that emit records.
 */
export type ActiveLogLevel = Exclude<LogLevel, "silent">

/**
 * Output wire format for the logger.
 */
export type LogFormat = "json" | "pretty"

/**
 * Error serialization verbosity.
 * - `"full"`: serializes `type`, `message`, `stack`, and custom properties via `pino.stdSerializers.err`.
 * - `"safe"`: logs only `{ type, code }` to avoid leaking sensitive details in `Error.message` or stack frames.
 */
export type ErrorMode = "safe" | "full"

/**
 * Structured key-value payload attached to a log entry.
 */
export type LogData = Record<string, unknown>

/**
 * Log payload object or lazy thunk invoked only when the target log level is enabled.
 */
export type LogDataInput = LogData | (() => LogData)

/**
 * Sanitized error shape returned by {@link safeError}.
 */
export interface SafeError {
  type: string
  code?: string
}

/**
 * Redaction configuration accepted by {@link LoggerOptions.redact}.
 */
export type RedactOption = false | string[] | { paths: string[]; censor?: string; remove?: boolean }

/**
 * Configuration options for {@link createLogger} and {@link LoggerClass}.
 */
export interface LoggerOptions {
  /** Application name included in log bindings and pretty prefixes. */
  app?: string
  /** Module name included in log bindings and pretty prefixes. */
  module?: string
  /** Class or component context included in log bindings and pretty prefixes. */
  context?: string
  /** Additional static bindings attached to every log entry. */
  bindings?: LogData
  /** Minimum log level. Overrides `LOG_LEVEL`. */
  level?: LogLevel
  /** Wire format (`"json"` or `"pretty"`). Overrides `LOG_FORMAT` and `LOG_HUMAN`. */
  format?: LogFormat
  /** Synchronous writes. Defaults to `true` when `NODE_ENV === "test"`, `false` otherwise. */
  sync?: boolean
  /** Custom Pino destination stream for testing, files, or stderr routing. */
  destination?: DestinationStream
  /** Override or extend default redaction paths; pass `false` to disable redaction. */
  redact?: RedactOption
  /** Optional Pino mixin hook invoked on every log entry (e.g. AsyncLocalStorage correlation IDs). */
  mixin?: () => LogData
  /** Error serialization mode. Defaults to `"full"`. */
  errorMode?: ErrorMode
  /** Environment source for deterministic config resolution. Defaults to `process.env`. */
  env?: Record<string, string | undefined>
}

/**
 * Captured in-memory logger returned by {@link createMemoryLogger}.
 */
export interface MemoryLogger<TLogger> {
  logger: TLogger
  records: Record<string, unknown>[]
  clear: () => void
}

/**
 * Opt-in `AsyncLocalStorage`-backed correlation context returned by {@link createLogContext}.
 */
export interface LogContext<T extends LogData = LogData> {
  /** Execute `fn` with `fields` merged into the current async context. */
  run: <R>(fields: T, fn: () => R) => R
  /** Read the current correlation fields, if inside a `run()` scope. */
  get: () => T | undefined
  /** Pino `mixin` callback returning the active correlation fields or `{}`. */
  mixin: () => LogData
}
