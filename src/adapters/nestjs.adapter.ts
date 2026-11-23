import type { LoggerService as NestLoggerService } from "@nestjs/common"
import { LoggerClass, createLogger } from "../core/logger.class"
import type { LogData, LogDataInput, LogLevel, LoggerOptions } from "../core/types"

/**
 * Optional DI token for registering a single shared root {@link LoggerClass} in NestJS
 * so every {@link NestJSLoggerAdapter.forFeature} module reuses the same underlying Pino stream.
 */
export const NEST_ROOT_LOGGER = Symbol.for("@we-are-singular/logger/NEST_ROOT_LOGGER")

/**
 * NestJS adapter wrapping an immutable {@link LoggerClass}.
 */
export class NestJSLoggerAdapter {
  readonly logger: LoggerClass

  constructor(loggerOrOptions?: LoggerClass | LoggerOptions) {
    this.logger = loggerOrOptions instanceof LoggerClass ? loggerOrOptions : createLogger(loggerOrOptions)
  }

  /**
   * Register a shared root {@link LoggerClass} provider so `forFeature()` calls derive
   * child loggers from a single Pino stream instead of creating a new stream per module.
   */
  static forRootProvider(logger: LoggerClass) {
    return {
      provide: NEST_ROOT_LOGGER,
      useValue: logger,
    }
  }

  /**
   * Create a NestJS module provider scoped to `module`.
   * Reuses the injected `NEST_ROOT_LOGGER` or explicit `parent` logger when provided.
   */
  static forFeature(
    module: string,
    useClass: typeof NestJSLoggerAdapter = NestJSLoggerAdapter,
    parent?: LoggerClass | NestJSLoggerAdapter
  ) {
    if (parent) {
      const baseLogger = parent instanceof NestJSLoggerAdapter ? parent.logger : parent
      return {
        provide: useClass,
        useFactory: () => new useClass(baseLogger.withModule(module)),
      }
    }

    return {
      provide: useClass,
      inject: [{ token: NEST_ROOT_LOGGER, optional: true }],
      useFactory: (rootLogger?: LoggerClass) => new useClass((rootLogger ?? createLogger()).withModule(module)),
    }
  }

  /**
   * Current active log level of the underlying logger.
   */
  get level(): LogLevel {
    return this.logger.level
  }

  /**
   * Return an object implementing NestJS's internal `LoggerService` interface for `NestFactory.create(..., { logger })`.
   */
  forRoot(): NestLoggerService {
    return {
      log: (message: unknown, context?: unknown, extra?: unknown) => {
        const msg = String(message)
        const data: LogData = {}
        if (typeof context === "string" && context.length > 0) {
          data.context = context
        }
        if (extra !== undefined) {
          data.extra = extra
        }
        if (Object.keys(data).length > 0) {
          this.logger.info(msg, data)
        } else {
          this.logger.info(msg)
        }
      },
      error: (message: unknown, stack?: unknown, context?: unknown) => {
        const msg = message instanceof Error ? message.message : String(message)
        const data: LogData = {}
        if (typeof context === "string" && context.length > 0) {
          data.context = context
        }
        if (typeof stack === "string" && stack.length > 0) {
          data.stack = stack
        }
        if (message instanceof Error) {
          data.err = message
        }
        if (Object.keys(data).length > 0) {
          this.logger.error(msg, data)
        } else {
          this.logger.error(msg)
        }
      },
      warn: (message: unknown, context?: unknown) => {
        const msg = String(message)
        if (typeof context === "string" && context.length > 0) {
          this.logger.warn(msg, { context })
        } else {
          this.logger.warn(msg)
        }
      },
      debug: (message: unknown, context?: unknown) => {
        const msg = String(message)
        if (typeof context === "string" && context.length > 0) {
          this.logger.debug(msg, { context })
        } else {
          this.logger.debug(msg)
        }
      },
      verbose: (message: unknown, context?: unknown) => {
        const msg = String(message)
        if (typeof context === "string" && context.length > 0) {
          this.logger.trace(msg, { context })
        } else {
          this.logger.trace(msg)
        }
      },
      fatal: (message: unknown, context?: unknown) => {
        const msg = String(message)
        if (typeof context === "string" && context.length > 0) {
          this.logger.fatal(msg, { context })
        } else {
          this.logger.fatal(msg)
        }
      },
    }
  }

  /**
   * Derive an immutable child adapter with the `module` binding set.
   */
  withModule(module: string, useClass: typeof NestJSLoggerAdapter = NestJSLoggerAdapter): NestJSLoggerAdapter {
    return new useClass(this.logger.withModule(module))
  }

  /**
   * Derive an immutable child adapter with the `context` binding set.
   */
  withContext(context: string, useClass: typeof NestJSLoggerAdapter = NestJSLoggerAdapter): NestJSLoggerAdapter {
    return new useClass(this.logger.withContext(context))
  }

  /**
   * Derive an immutable child adapter with additional static bindings merged.
   */
  withBindings(bindings: LogData, useClass: typeof NestJSLoggerAdapter = NestJSLoggerAdapter): NestJSLoggerAdapter {
    return new useClass(this.logger.withBindings(bindings))
  }

  /**
   * Fork this adapter while preserving all bindings.
   */
  fork(useClass: typeof NestJSLoggerAdapter = NestJSLoggerAdapter): NestJSLoggerAdapter {
    return new useClass(this.logger.fork())
  }

  flush(cb?: (err?: Error) => void): void {
    this.logger.flush(cb)
  }

  log(message: string, data?: LogDataInput): void {
    this.logger.info(message, data)
  }

  info(message: string, data?: LogDataInput): void {
    this.logger.info(message, data)
  }

  error(message: string, data?: LogDataInput): void {
    this.logger.error(message, data)
  }

  warn(message: string, data?: LogDataInput): void {
    this.logger.warn(message, data)
  }

  debug(message: string, data?: LogDataInput): void {
    this.logger.debug(message, data)
  }

  verbose(message: string, data?: LogDataInput): void {
    this.logger.trace(message, data)
  }

  fatal(message: string, data?: LogDataInput): void {
    this.logger.fatal(message, data)
  }
}

/**
 * Create a {@link NestJSLoggerAdapter} from an existing {@link LoggerClass} or {@link LoggerOptions}.
 */
export function createNestJSLogger(loggerOrOptions?: LoggerClass | LoggerOptions): NestJSLoggerAdapter {
  return new NestJSLoggerAdapter(loggerOrOptions)
}
