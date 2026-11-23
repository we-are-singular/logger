import type { ChildLoggerOptions, Logger as PinoLogger } from "pino"
import { normalizeLogData } from "./config"
import { createRootPino } from "./pino-factory"
import type { ActiveLogLevel, ErrorMode, LogData, LogDataInput, LogLevel, LoggerOptions } from "./types"

const INTERNAL_CONSTRUCT = Symbol("LoggerClass.internal")

interface InternalInit {
  [INTERNAL_CONSTRUCT]: true
  rootPino: PinoLogger
  pino: PinoLogger
  errorMode: ErrorMode
  hasCustomChildOptions: boolean
}

function isInternalInit(value: unknown): value is InternalInit {
  return typeof value === "object" && value !== null && INTERNAL_CONSTRUCT in value
}

/**
 * Immutable Pino v10 logger wrapper.
 *
 * Derive child loggers via {@link withModule}, {@link withContext}, {@link withBindings},
 * {@link child}, or {@link fork} instead of mutating instances or recreating root streams.
 */
export class LoggerClass {
  readonly pino: PinoLogger
  private readonly rootPino: PinoLogger
  private readonly errorMode: ErrorMode
  private readonly hasCustomChildOptions: boolean

  constructor(
    app?: string,
    module?: string,
    context?: string,
    options?: Omit<LoggerOptions, "app" | "module" | "context">
  )
  /** @internal */
  constructor(internal: InternalInit)
  constructor(
    appOrInternal?: string | InternalInit,
    module?: string,
    context?: string,
    options?: Omit<LoggerOptions, "app" | "module" | "context">
  ) {
    if (isInternalInit(appOrInternal)) {
      this.rootPino = appOrInternal.rootPino
      this.pino = appOrInternal.pino
      this.errorMode = appOrInternal.errorMode
      this.hasCustomChildOptions = appOrInternal.hasCustomChildOptions
      return
    }

    const created = createRootPino({
      ...options,
      ...(appOrInternal !== undefined ? { app: appOrInternal } : {}),
      ...(module !== undefined ? { module } : {}),
      ...(context !== undefined ? { context } : {}),
    })
    this.rootPino = created.rootPino
    this.pino = created.pino
    this.errorMode = created.errorMode
    this.hasCustomChildOptions = false
  }

  /**
   * Current active log level of the underlying Pino instance.
   */
  get level(): LogLevel {
    return this.pino.level as LogLevel
  }

  /**
   * Create an independent child logger preserving all existing bindings.
   */
  fork(): LoggerClass {
    return new LoggerClass({
      [INTERNAL_CONSTRUCT]: true,
      rootPino: this.rootPino,
      pino: this.pino.child({}),
      errorMode: this.errorMode,
      hasCustomChildOptions: this.hasCustomChildOptions,
    })
  }

  /**
   * Return a new logger with the `module` binding set, without mutating this logger.
   */
  withModule(module: string): LoggerClass {
    return this.child({ module })
  }

  /**
   * Return a new logger with the `context` binding set, without mutating this logger.
   */
  withContext(context: string): LoggerClass {
    return this.child({ context })
  }

  /**
   * Return a new logger with additional static bindings merged, without mutating this logger.
   */
  withBindings(bindings: LogData): LoggerClass {
    return this.child(bindings)
  }

  /**
   * Return a new child logger with additional static bindings and optional Pino child options.
   */
  child(bindings: LogData, childOptions?: ChildLoggerOptions): LoggerClass {
    const existing = this.pino.bindings() as LogData
    const hasOverlap = Object.keys(bindings).some(key => Object.hasOwn(existing, key))
    const hasCustomOptions = this.hasCustomChildOptions || childOptions !== undefined

    // Fast path: chain directly from this.pino to reuse pre-serialized chindings.
    // Rebuild from rootPino when overriding an existing key so raw NDJSON never emits duplicate keys.
    const nextPino =
      hasOverlap && !this.hasCustomChildOptions
        ? this.rootPino.child({ ...existing, ...bindings }, { level: this.pino.level, ...childOptions })
        : this.pino.child(bindings, childOptions)

    return new LoggerClass({
      [INTERNAL_CONSTRUCT]: true,
      rootPino: this.rootPino,
      pino: nextPino,
      errorMode: this.errorMode,
      hasCustomChildOptions: hasCustomOptions,
    })
  }

  /**
   * Check whether a log level is currently enabled before computing expensive diagnostics.
   */
  isLevelEnabled(level: ActiveLogLevel): boolean {
    return this.pino.isLevelEnabled(level)
  }

  /**
   * Flush buffered logs to the underlying destination stream.
   */
  flush(cb?: (err?: Error) => void): void {
    this.pino.flush(cb)
  }

  trace(message: string, data?: LogDataInput): void {
    this.write("trace", message, data)
  }

  debug(message: string, data?: LogDataInput): void {
    this.write("debug", message, data)
  }

  info(message: string, data?: LogDataInput): void {
    this.write("info", message, data)
  }

  warn(message: string, data?: LogDataInput): void {
    this.write("warn", message, data)
  }

  error(message: string, data?: LogDataInput): void {
    this.write("error", message, data)
  }

  fatal(message: string, data?: LogDataInput): void {
    this.write("fatal", message, data)
  }

  private write(level: ActiveLogLevel, message: string, data?: LogDataInput): void {
    if (!this.pino.isLevelEnabled(level)) {
      return
    }

    if (data === undefined) {
      this.pino[level](message)
      return
    }

    const resolved: unknown = typeof data === "function" ? data() : data
    if (resolved === undefined) {
      this.pino[level](message)
      return
    }

    this.pino[level](normalizeLogData(resolved, this.errorMode), message)
  }
}

/**
 * Create a configured, side-effect-free {@link LoggerClass} instance.
 */
export function createLogger(options: LoggerOptions = {}): LoggerClass {
  const { app, module, context, ...rest } = options
  return new LoggerClass(app, module, context, rest)
}
