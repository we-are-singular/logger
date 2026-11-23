import type { FastifyBaseLogger } from "fastify"
import type { Bindings, ChildLoggerOptions } from "pino"
import { isErrorInstance, isPlainObject, normalizeLogData, safeError, sanitizeSafeValue } from "../core/config"
import { LoggerClass, createLogger, isLoggerClass } from "../core/logger.class"
import type { ActiveLogLevel, ErrorMode, LogData, LoggerOptions } from "../core/types"

const PRINTF_SPECIFIER = /%[sdjifoO%]/

function sanitizePrintfArgs(args: unknown[], errorMode: ErrorMode): unknown[] {
  if (errorMode !== "safe" || args.length === 0) {
    return args
  }

  return args.map(arg => {
    if (isErrorInstance(arg)) {
      return safeError(arg).type
    }
    return sanitizeSafeValue(arg)
  })
}

function scrubSafeErrorMessage(message: string, candidate: unknown): string {
  if (isErrorInstance(candidate)) {
    return message === candidate.message ? safeError(candidate).type : message
  }
  if (isPlainObject(candidate) && typeof candidate.message === "string" && message === candidate.message) {
    return safeError(candidate).type
  }
  return message
}

/**
 * Fastify v5-compatible `FastifyBaseLogger` adapter backed by an immutable {@link LoggerClass}.
 *
 * `child()` chains directly off the underlying Pino logger with zero extra root allocations.
 */
export class FastifyLoggerAdapter implements FastifyBaseLogger {
  readonly logger: LoggerClass

  constructor(loggerOrOptions?: LoggerClass | LoggerOptions)
  constructor(
    app?: string,
    module?: string,
    context?: string,
    options?: Omit<LoggerOptions, "app" | "module" | "context">
  )
  constructor(
    loggerOrAppOrOptions?: LoggerClass | LoggerOptions | string,
    module?: string,
    context?: string,
    options?: Omit<LoggerOptions, "app" | "module" | "context">
  ) {
    if (isLoggerClass(loggerOrAppOrOptions)) {
      // Fork injected loggers so Fastify level mutations stay isolated from shared parent loggers.
      this.logger = loggerOrAppOrOptions.fork()
      return
    }

    if (typeof loggerOrAppOrOptions === "object" && loggerOrAppOrOptions !== null) {
      this.logger = createLogger(loggerOrAppOrOptions)
      return
    }

    this.logger = new LoggerClass(loggerOrAppOrOptions, module, context, options)
  }

  private static fromChildLogger(logger: LoggerClass): FastifyLoggerAdapter {
    const adapter = Object.create(FastifyLoggerAdapter.prototype) as FastifyLoggerAdapter
    Object.assign(adapter, { logger })
    return adapter
  }

  /**
   * Current Pino log level. Reads and mutates this adapter's child Pino level without affecting
   * any shared parent logger passed to the constructor.
   */
  get level(): string {
    return this.logger.pino.level
  }

  set level(value: string) {
    this.logger.pino.level = value
  }

  /**
   * Create a Fastify child logger reusing the underlying Pino stream with zero wasted root allocations.
   */
  child(bindings: Bindings, options?: ChildLoggerOptions): FastifyLoggerAdapter {
    return FastifyLoggerAdapter.fromChildLogger(this.logger.child(bindings as LogData, options))
  }

  /**
   * Flush buffered logs to the underlying destination stream.
   */
  flush(cb?: (err?: Error) => void): void {
    this.logger.flush(cb)
  }

  info(obj: unknown, msg?: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  info(msgOrObj: unknown, ...args: unknown[]): void {
    this.logAt("info", msgOrObj, args)
  }

  error(obj: unknown, msg?: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
  error(msgOrObj: unknown, ...args: unknown[]): void {
    this.logAt("error", msgOrObj, args)
  }

  debug(obj: unknown, msg?: string, ...args: unknown[]): void
  debug(msg: string, ...args: unknown[]): void
  debug(msgOrObj: unknown, ...args: unknown[]): void {
    this.logAt("debug", msgOrObj, args)
  }

  fatal(obj: unknown, msg?: string, ...args: unknown[]): void
  fatal(msg: string, ...args: unknown[]): void
  fatal(msgOrObj: unknown, ...args: unknown[]): void {
    this.logAt("fatal", msgOrObj, args)
  }

  warn(obj: unknown, msg?: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  warn(msgOrObj: unknown, ...args: unknown[]): void {
    this.logAt("warn", msgOrObj, args)
  }

  trace(obj: unknown, msg?: string, ...args: unknown[]): void
  trace(msg: string, ...args: unknown[]): void
  trace(msgOrObj: unknown, ...args: unknown[]): void {
    this.logAt("trace", msgOrObj, args)
  }

  silent(): void {
    // No-op required by FastifyBaseLogger.
  }

  private logAt(level: ActiveLogLevel, msgOrObj: unknown, args: unknown[]): void {
    if (!this.logger.pino.isLevelEnabled(level)) {
      return
    }

    const logFn = this.logger.pino[level] as (...params: unknown[]) => void
    const { errorMode } = this.logger

    if (typeof msgOrObj === "string") {
      // Support both Fastify's `(msg, ...printfArgs)` and ergonomic `(msg, dataObj)` calls.
      if (args.length === 1 && isPlainObject(args[0]) && !PRINTF_SPECIFIER.test(msgOrObj)) {
        this.logger[level](msgOrObj, args[0])
        return
      }
      logFn.call(this.logger.pino, msgOrObj, ...sanitizePrintfArgs(args, errorMode))
      return
    }

    if (isErrorInstance(msgOrObj)) {
      const hasMessageArg = typeof args[0] === "string"
      const fallbackMessage = errorMode === "safe" ? safeError(msgOrObj).type : msgOrObj.message
      let message = hasMessageArg ? (args[0] as string) : fallbackMessage
      if (errorMode === "safe" && hasMessageArg) {
        message = scrubSafeErrorMessage(message, msgOrObj)
      }
      const errPayload = errorMode === "safe" ? safeError(msgOrObj) : msgOrObj
      // Never interpolate err.message as a printf format string when no explicit message arg was supplied.
      if (hasMessageArg) {
        logFn.call(this.logger.pino, { err: errPayload }, message, ...sanitizePrintfArgs(args.slice(1), errorMode))
      } else {
        logFn.call(this.logger.pino, { err: errPayload }, message)
      }
      return
    }

    const normalized = normalizeLogData(msgOrObj, errorMode)
    if (typeof args[0] === "string") {
      let message = args[0]
      // Fastify's default error handler logs `({ req, res, err }, err.message)` for Errors and error-like objects.
      if (errorMode === "safe" && isPlainObject(msgOrObj)) {
        const candidate = msgOrObj.err ?? msgOrObj.error
        if (candidate !== undefined) {
          message = scrubSafeErrorMessage(message, candidate)
        }
      }
      logFn.call(this.logger.pino, normalized, message, ...sanitizePrintfArgs(args.slice(1), errorMode))
      return
    }

    logFn.call(this.logger.pino, normalized)
  }
}

/**
 * Create a Fastify v5-compatible {@link FastifyLoggerAdapter} from an existing {@link LoggerClass}
 * or {@link LoggerOptions}. Pass the returned instance to `fastify({ loggerInstance })`.
 */
export function createFastifyLogger(loggerOrOptions?: LoggerClass | LoggerOptions): FastifyLoggerAdapter {
  return new FastifyLoggerAdapter(loggerOrOptions)
}
