import type { FastifyBaseLogger } from "fastify"
import type { Bindings, ChildLoggerOptions } from "pino"
import { LoggerClass, createLogger } from "../core/logger.class"
import type { ActiveLogLevel, LogData, LoggerOptions } from "../core/types"

const PRINTF_SPECIFIER = /%[sdjifoO%]/

function isPlainObject(value: unknown): value is LogData {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Fastify v5-compatible `FastifyBaseLogger` adapter backed by an immutable {@link LoggerClass}.
 *
 * `child()` chains directly off the underlying Pino logger with zero extra root allocations.
 */
export class FastifyLoggerAdapter implements FastifyBaseLogger {
  readonly logger: LoggerClass

  constructor(logger: LoggerClass)
  constructor(
    app?: string,
    module?: string,
    context?: string,
    options?: Omit<LoggerOptions, "app" | "module" | "context">
  )
  constructor(
    loggerOrApp?: LoggerClass | string,
    module?: string,
    context?: string,
    options?: Omit<LoggerOptions, "app" | "module" | "context">
  ) {
    this.logger =
      loggerOrApp instanceof LoggerClass ? loggerOrApp : new LoggerClass(loggerOrApp, module, context, options)
  }

  /**
   * Current Pino log level. Reads and mutates the underlying child Pino level cleanly.
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
  child(bindings: Bindings, options?: ChildLoggerOptions): FastifyBaseLogger {
    return new FastifyLoggerAdapter(this.logger.child(bindings as LogData, options))
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

    if (typeof msgOrObj === "string") {
      // Support both Fastify's `(msg, ...printfArgs)` and ergonomic `(msg, dataObj)` calls.
      if (args.length === 1 && isPlainObject(args[0]) && !PRINTF_SPECIFIER.test(msgOrObj)) {
        this.logger[level](msgOrObj, args[0])
        return
      }
      if (args.length === 0) {
        logFn.call(this.logger.pino, msgOrObj)
        return
      }
      logFn.call(this.logger.pino, msgOrObj, ...args)
      return
    }

    if (msgOrObj instanceof Error) {
      const message = typeof args[0] === "string" ? args[0] : msgOrObj.message
      const interpolation = typeof args[0] === "string" ? args.slice(1) : args
      if (interpolation.length > 0) {
        logFn.call(this.logger.pino, { err: msgOrObj }, message, ...interpolation)
      } else {
        this.logger[level](message, { err: msgOrObj })
      }
      return
    }

    if (typeof args[0] === "string") {
      const [msg, ...interpolation] = args
      if (interpolation.length > 0) {
        logFn.call(this.logger.pino, msgOrObj, msg, ...interpolation)
      } else {
        logFn.call(this.logger.pino, msgOrObj, msg)
      }
      return
    }

    if (isPlainObject(msgOrObj)) {
      logFn.call(this.logger.pino, msgOrObj)
      return
    }

    logFn.call(this.logger.pino, { value: msgOrObj })
  }
}

/**
 * Create a Fastify v5-compatible {@link FastifyLoggerAdapter} from an existing {@link LoggerClass}
 * or {@link LoggerOptions}. Pass the returned instance to `fastify({ loggerInstance })`.
 */
export function createFastifyLogger(loggerOrOptions?: LoggerClass | LoggerOptions): FastifyLoggerAdapter {
  if (loggerOrOptions instanceof LoggerClass) {
    return new FastifyLoggerAdapter(loggerOrOptions)
  }
  return new FastifyLoggerAdapter(createLogger(loggerOrOptions))
}
