import { getLogger } from "./pino.instance"
import type { NestJSLoggerClass } from "./nestjs/LoggerService"
import type { FastifyLoggerClass } from "./fastify/FastifyLoggerClass"

/**
 * Logger class
 * @param app
 * @param module
 * @param context
 * @constructor
 * @example
 * const logger = new Logger("test")
 * logger.info("hello world")
 * logger.addModule("some module")
 * logger.info("hello world", { user: { id: 1, name: "John Doe" } })
 */
export class LoggerClass {
  private app = ""
  private module = ""
  private context = ""
  public pino = getLogger()
  constructor(app?: string, module?: string, context?: string) {
    this.app = app ?? ""
    this.module = module ?? ""
    this.context = context ?? ""
    this.updateLogger()
  }

  private updateLogger() {
    this.pino = getLogger().child({
      ...(this.app && { app: this.app }),
      ...(this.module && { module: this.module }),
      ...(this.context && { context: this.context }),
    })

    return this
  }

  fork() {
    return new LoggerClass(this.app, this.module, this.context)
  }

  setModule(module: string) {
    this.module = module
    return this.updateLogger()
  }

  setContext(context: string) {
    this.context = context
    return this.updateLogger()
  }

  trace(message: string, data?: unknown) {
    this.pino.trace(data || null, message)
  }

  debug(message: string, data?: unknown) {
    this.pino.debug(data || null, message)
  }

  info(message: string, data?: unknown) {
    this.pino.info(data || null, message)
  }

  warn(message: string, data?: unknown) {
    this.pino.warn(data || null, message)
  }

  error(message: string, data?: unknown) {
    this.pino.error(data || null, message)
  }

  fatal(message: string, data?: unknown) {
    this.pino.fatal(data || null, message)
  }

  /**
   * Factory method to create a NestJS logger instance
   * @param module Optional module name
   * @returns NestJSLoggerClass instance
   * @example
   * const nestLogger = LoggerClass.forNestJS("MyModule")
   */
  static forNestJS(module?: string): NestJSLoggerClass {
    // Dynamic import to avoid circular dependency
    /* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-var-requires */
    const { NestJSLoggerClass: NestClass } = require("./nestjs/LoggerService") as {
      NestJSLoggerClass: typeof import("./nestjs/LoggerService").NestJSLoggerClass
    }
    /* eslint-enable @typescript-eslint/naming-convention, @typescript-eslint/no-var-requires */
    const logger = new NestClass()
    return module ? logger.withModule(module) : logger
  }

  /**
   * Factory method to create a Fastify logger instance
   * @param module Optional module name
   * @returns FastifyLoggerClass instance
   * @example
   * const fastifyLogger = LoggerClass.forFastify("api")
   * const app = fastify({ logger: fastifyLogger })
   */
  static forFastify(module?: string): FastifyLoggerClass {
    // Dynamic import to avoid circular dependency
    /* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-var-requires */
    const { FastifyLoggerClass: FastifyClass } = require("./fastify/FastifyLoggerClass") as {
      FastifyLoggerClass: typeof import("./fastify/FastifyLoggerClass").FastifyLoggerClass
    }
    /* eslint-enable @typescript-eslint/naming-convention, @typescript-eslint/no-var-requires */
    return new FastifyClass(module)
  }
}
