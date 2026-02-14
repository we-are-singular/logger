import type { FastifyBaseLogger } from "fastify"
import { LoggerClass } from "../LoggerClass"

/**
 * Fastify logger class that implements FastifyBaseLogger interface
 * @example
 * const fastifyLogger = new FastifyLoggerClass("api")
 * const app = fastify({ logger: fastifyLogger })
 */
export class FastifyLoggerClass implements FastifyBaseLogger {
  private logger: LoggerClass
  public level: string

  constructor(module?: string) {
    this.logger = new LoggerClass()
    if (module) {
      this.logger.setModule(module)
    }
    this.level = process.env.LOG_LEVEL ?? "info"
  }

  /**
   * Create a child logger instance
   * @returns New FastifyLoggerClass instance
   */
  child(): FastifyBaseLogger {
    const childLogger = new FastifyLoggerClass()
    childLogger.logger = this.logger.fork()
    return childLogger
  }

  info(message: string | object, ...args: unknown[]): void
  info(obj: object, message?: string, ...args: unknown[]): void
  info(msgOrObj: string | object, ...args: unknown[]): void {
    if (typeof msgOrObj === "string") {
      this.logger.info(msgOrObj, args[0])
    } else {
      const message = typeof args[0] === "string" ? args[0] : ""
      this.logger.info(message, msgOrObj)
    }
  }

  error(message: string | object, ...args: unknown[]): void
  error(obj: object, message?: string, ...args: unknown[]): void
  error(msgOrObj: string | object, ...args: unknown[]): void {
    if (typeof msgOrObj === "string") {
      this.logger.error(msgOrObj, args[0])
    } else {
      const message = typeof args[0] === "string" ? args[0] : ""
      this.logger.error(message, msgOrObj)
    }
  }

  debug(message: string | object, ...args: unknown[]): void
  debug(obj: object, message?: string, ...args: unknown[]): void
  debug(msgOrObj: string | object, ...args: unknown[]): void {
    if (typeof msgOrObj === "string") {
      this.logger.debug(msgOrObj, args[0])
    } else {
      const message = typeof args[0] === "string" ? args[0] : ""
      this.logger.debug(message, msgOrObj)
    }
  }

  fatal(message: string | object, ...args: unknown[]): void
  fatal(obj: object, message?: string, ...args: unknown[]): void
  fatal(msgOrObj: string | object, ...args: unknown[]): void {
    if (typeof msgOrObj === "string") {
      this.logger.fatal(msgOrObj, args[0])
    } else {
      const message = typeof args[0] === "string" ? args[0] : ""
      this.logger.fatal(message, msgOrObj)
    }
  }

  warn(message: string | object, ...args: unknown[]): void
  warn(obj: object, message?: string, ...args: unknown[]): void
  warn(msgOrObj: string | object, ...args: unknown[]): void {
    if (typeof msgOrObj === "string") {
      this.logger.warn(msgOrObj, args[0])
    } else {
      const message = typeof args[0] === "string" ? args[0] : ""
      this.logger.warn(message, msgOrObj)
    }
  }

  trace(message: string | object, ...args: unknown[]): void
  trace(obj: object, message?: string, ...args: unknown[]): void
  trace(msgOrObj: string | object, ...args: unknown[]): void {
    if (typeof msgOrObj === "string") {
      this.logger.trace(msgOrObj, args[0])
    } else {
      const message = typeof args[0] === "string" ? args[0] : ""
      this.logger.trace(message, msgOrObj)
    }
  }

  silent(): void {
    // No-op for silent level
  }
}
