import { NestJSLoggerClass } from "./nestjs/LoggerService"
import { FastifyLoggerClass } from "./fastify/FastifyLoggerClass"

/**
 * Factory methods for creating framework-specific logger instances
 */
export class LoggerFactory {
  /**
   * Factory method to create a NestJS logger instance
   * @param module Optional module name
   * @returns NestJSLoggerClass instance
   * @example
   * const nestLogger = LoggerFactory.forNestJS("MyModule")
   */
  static forNestJS(module?: string): NestJSLoggerClass {
    const logger = new NestJSLoggerClass()
    return module ? logger.withModule(module) : logger
  }

  /**
   * Factory method to create a Fastify logger instance
   * @param app Optional app name
   * @param module Optional module name
   * @returns FastifyLoggerClass instance
   * @example
   * const fastifyLogger = LoggerFactory.forFastify("MyApp", "api")
   * const app = fastify({ logger: fastifyLogger })
   */
  static forFastify(app?: string, module?: string): FastifyLoggerClass {
    return new FastifyLoggerClass(app, module)
  }
}
