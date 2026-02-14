import type { FastifyBaseLogger } from "fastify"
import type { Bindings, ChildLoggerOptions } from "pino"
import { LoggerClass } from "../LoggerClass"

/**
 * Fastify logger class that implements FastifyBaseLogger interface
 * @example
 * const fastifyLogger = new FastifyLoggerClass("MyApp", "api")
 * const app = fastify({ logger: fastifyLogger })
 */
export class FastifyLoggerClass implements FastifyBaseLogger {
  private logger: LoggerClass
  public level: string

  constructor(app?: string, module?: string, context?: string) {
    this.logger = new LoggerClass(app, module, context)
    this.level = process.env.LOG_LEVEL ?? "info"
  }

  /**
   * Create a child logger instance
   * @param bindings Bindings to include in child logger
   * @param options Optional child logger options
   * @returns New FastifyLoggerClass instance
   */
  child(bindings: Bindings, options?: ChildLoggerOptions): FastifyBaseLogger {
    const childLogger = new FastifyLoggerClass()
    childLogger.logger = this.logger.fork(bindings, options)
    childLogger.level = this.level
    return childLogger
  }

  /**
   * Helper method to handle log method arguments
   */
  private getLogArgs(msgOrObj: string | object, args: unknown[]): [string, unknown?] {
    if (typeof msgOrObj === "string") {
      return [msgOrObj, args.length > 0 ? args[0] : undefined]
    } else {
      const message = typeof args[0] === "string" ? args[0] : JSON.stringify(msgOrObj)
      return [message, msgOrObj]
    }
  }

  info(message: string | object, ...args: unknown[]): void
  info(obj: object, message?: string, ...args: unknown[]): void
  info(msgOrObj: string | object, ...args: unknown[]): void {
    const [msg, data] = this.getLogArgs(msgOrObj, args)
    this.logger.info(msg, data)
  }

  error(message: string | object, ...args: unknown[]): void
  error(obj: object, message?: string, ...args: unknown[]): void
  error(msgOrObj: string | object, ...args: unknown[]): void {
    const [msg, data] = this.getLogArgs(msgOrObj, args)
    this.logger.error(msg, data)
  }

  debug(message: string | object, ...args: unknown[]): void
  debug(obj: object, message?: string, ...args: unknown[]): void
  debug(msgOrObj: string | object, ...args: unknown[]): void {
    const [msg, data] = this.getLogArgs(msgOrObj, args)
    this.logger.debug(msg, data)
  }

  fatal(message: string | object, ...args: unknown[]): void
  fatal(obj: object, message?: string, ...args: unknown[]): void
  fatal(msgOrObj: string | object, ...args: unknown[]): void {
    const [msg, data] = this.getLogArgs(msgOrObj, args)
    this.logger.fatal(msg, data)
  }

  warn(message: string | object, ...args: unknown[]): void
  warn(obj: object, message?: string, ...args: unknown[]): void
  warn(msgOrObj: string | object, ...args: unknown[]): void {
    const [msg, data] = this.getLogArgs(msgOrObj, args)
    this.logger.warn(msg, data)
  }

  trace(message: string | object, ...args: unknown[]): void
  trace(obj: object, message?: string, ...args: unknown[]): void
  trace(msgOrObj: string | object, ...args: unknown[]): void {
    const [msg, data] = this.getLogArgs(msgOrObj, args)
    this.logger.trace(msg, data)
  }

  silent(): void {
    // No-op for silent level
  }
}
