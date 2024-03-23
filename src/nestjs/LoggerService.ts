import { type LoggerService as NestLoggerService } from "@nestjs/common"
import { LoggerClass } from "../LoggerClass"

export class LoggerService {
  private logger: LoggerClass

  constructor(withLogger?: LoggerClass) {
    this.logger = withLogger ?? new LoggerClass()
    this.logger.pino.level = process.env.LOG_LEVEL ?? "info"
  }

  static forFeature(module: string, useClass: typeof LoggerService = LoggerService) {
    return {
      provide: useClass,
      useFactory: () => new useClass().withModule(module),
    }
  }

  /**
   * This is a workaround to create an interface complying to NestJS's LoggerService for internal logging
   */
  forRoot(): NestLoggerService {
    return {
      log: (msg, context: string, extra) => {
        this.logger.info(msg, { context, extra })
      },
      error: (msg, stack: unknown, context: string) => {
        this.logger.error(String(stack), { context, error: msg })
      },
      warn: (msg, context: string) => {
        this.logger.warn(msg, { context })
      },
      debug: (msg, context: string) => {
        this.logger.debug(msg, { context })
      },
      verbose: (msg, context: string) => {
        this.logger.trace(msg, { context })
      },
    }
  }

  withModule(module: string, useClass: typeof LoggerService = LoggerService) {
    return new useClass(this.logger.fork().setModule(module))
  }

  withContext(context: string, useClass: typeof LoggerService = LoggerService) {
    return new useClass(this.logger.fork().setContext(context))
  }

  log(msg: string, ...extra: unknown[]) {
    this.logger.info(msg, ...extra)
  }

  error(msg: string, ...extra: unknown[]) {
    this.logger.error(msg, ...extra)
  }

  warn(msg: string, ...extra: unknown[]) {
    this.logger.warn(msg, ...extra)
  }

  debug(msg: string, ...extra: unknown[]) {
    this.logger.debug(msg, ...extra)
  }

  verbose(msg: string, ...extra: unknown[]) {
    this.logger.trace(msg, ...extra)
  }
}
