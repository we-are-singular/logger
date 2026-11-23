import type { ChildLoggerOptions, Logger as PinoLogger } from "pino"
import { isPlainObject, normalizeLogData, sanitizeSafeRecord, serializeSafeError } from "./config"
import { createRootPino } from "./pino-factory"
import type { ActiveLogLevel, ErrorMode, LogData, LogDataInput, LogLevel, LoggerOptions } from "./types"

/**
 * Cross-realm brand symbol surviving dual ESM/CJS module loading.
 */
const LOGGER_CLASS_BRAND = Symbol.for("@we-are-singular/logger/LoggerClass")

function hasNonLevelChildOptions(options: ChildLoggerOptions | undefined): boolean {
  if (!options) {
    return false
  }
  for (const [key, value] of Object.entries(options)) {
    if (key !== "level" && value !== undefined) {
      return true
    }
  }
  return false
}

function enforceSafeSerializers(
  errorMode: ErrorMode,
  childOptions: ChildLoggerOptions | undefined
): ChildLoggerOptions | undefined {
  if (errorMode !== "safe" || !childOptions?.serializers) {
    return childOptions
  }

  // Prevent frameworks like Fastify v5 from overwriting safeError with pino.stdSerializers.err.
  return {
    ...childOptions,
    serializers: {
      ...childOptions.serializers,
      err: serializeSafeError,
      error: serializeSafeError,
    },
  }
}

/**
 * Cross-realm type guard for {@link LoggerClass} instances (safe across mixed ESM/CJS imports).
 * @internal
 */
export function isLoggerClass(value: unknown): value is LoggerClass {
  return typeof value === "object" && value !== null && LOGGER_CLASS_BRAND in value
}

/**
 * Immutable Pino v10 logger wrapper.
 *
 * Derive child loggers via {@link withModule}, {@link withContext}, {@link withBindings},
 * {@link child}, or {@link fork} instead of mutating instances or recreating root streams.
 */
export class LoggerClass {
  readonly pino: PinoLogger
  readonly errorMode: ErrorMode
  private readonly rootPino: PinoLogger
  private readonly bindings: Readonly<LogData>
  private readonly hasCustomChildOptions: boolean

  constructor(options?: LoggerOptions)
  constructor(
    app?: string,
    module?: string,
    context?: string,
    options?: Omit<LoggerOptions, "app" | "module" | "context">
  )
  constructor(
    appOrOptions?: string | LoggerOptions,
    module?: string,
    context?: string,
    options?: Omit<LoggerOptions, "app" | "module" | "context">
  ) {
    const resolvedOptions: LoggerOptions = isPlainObject(appOrOptions)
      ? appOrOptions
      : {
          ...options,
          ...(appOrOptions !== undefined ? { app: appOrOptions } : {}),
          ...(module !== undefined ? { module } : {}),
          ...(context !== undefined ? { context } : {}),
        }

    const created = createRootPino(resolvedOptions)
    this.rootPino = created.rootPino
    this.pino = created.pino
    this.bindings = created.bindings
    this.errorMode = created.errorMode
    this.hasCustomChildOptions = false
    Object.defineProperty(this, LOGGER_CLASS_BRAND, { value: true })
  }

  private static createDerived(state: {
    rootPino: PinoLogger
    pino: PinoLogger
    bindings: Readonly<LogData>
    errorMode: ErrorMode
    hasCustomChildOptions: boolean
  }): LoggerClass {
    const derived = Object.create(LoggerClass.prototype) as LoggerClass
    Object.assign(derived, state)
    Object.defineProperty(derived, LOGGER_CLASS_BRAND, { value: true })
    return derived
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
    return this.child({})
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
    const safeBindings = this.errorMode === "safe" ? sanitizeSafeRecord(bindings) : bindings
    const safeOptions = enforceSafeSerializers(this.errorMode, childOptions)
    const bindingKeys = Object.keys(safeBindings)
    const hasOverlap = bindingKeys.some(key => Object.hasOwn(this.bindings, key))
    const hasCustomOptions = this.hasCustomChildOptions || hasNonLevelChildOptions(safeOptions)
    const nextBindings: LogData = bindingKeys.length > 0 ? { ...this.bindings, ...safeBindings } : this.bindings

    // Fast path chains directly from this.pino to reuse pre-serialized chindings.
    // When overriding an existing key (and no ancestor set non-level custom childOptions),
    // rebuild from rootPino so raw NDJSON avoids duplicate keys while preserving level.
    const nextPino =
      hasOverlap && !this.hasCustomChildOptions
        ? this.rootPino.child(nextBindings, {
            ...safeOptions,
            level: safeOptions?.level ?? this.pino.level,
          })
        : this.pino.child(safeBindings, safeOptions)

    return LoggerClass.createDerived({
      rootPino: this.rootPino,
      pino: nextPino,
      bindings: nextBindings,
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
  return new LoggerClass(options)
}
