import type { FactoryProvider, LoggerService as NestLoggerService, ValueProvider } from "@nestjs/common"
import { isErrorInstance, isPlainObject, safeError } from "../core/config"
import { createLogger, isLoggerClass, type LoggerClass } from "../core/logger.class"
import type { ActiveLogLevel, ErrorMode, LogData, LogDataInput, LogLevel, LoggerOptions } from "../core/types"

/**
 * Optional DI token for registering a single shared root {@link LoggerClass} in NestJS
 * so every {@link NestJSLoggerAdapter.forFeature} module reuses the same underlying Pino stream.
 *
 * Register {@link NestJSLoggerAdapter.forRootProvider} in a `@Global()` module and export
 * `NEST_ROOT_LOGGER` so feature modules can inject it.
 */
export const NEST_ROOT_LOGGER = Symbol.for("@we-are-singular/logger/NEST_ROOT_LOGGER")

const NEST_ADAPTER_BRAND = Symbol.for("@we-are-singular/logger/NestJSLoggerAdapter")
const STACK_LINE_PATTERN = /\n[ \t]+at\s+/

function isNestJSLoggerAdapter(value: unknown): value is NestJSLoggerAdapter {
  return typeof value === "object" && value !== null && NEST_ADAPTER_BRAND in value
}

function isStackString(value: unknown): value is string {
  return typeof value === "string" && STACK_LINE_PATTERN.test(value)
}

function formatNestMessage(message: unknown, errorMode: ErrorMode): { text: string; objectPayload?: LogData } {
  if (isErrorInstance(message)) {
    return { text: errorMode === "safe" ? safeError(message).type : message.message }
  }
  if (typeof message === "string") {
    return { text: message }
  }
  if (isPlainObject(message)) {
    return { text: "", objectPayload: message }
  }
  return { text: String(message) }
}

function parseStandardParams(optionalParams: unknown[]): LogData {
  if (optionalParams.length === 0) {
    return {}
  }

  if (optionalParams.length === 1) {
    const [only] = optionalParams
    if (typeof only === "string" && only.length > 0) {
      return { context: only }
    }
    if (isErrorInstance(only)) {
      return { err: only }
    }
    return only !== undefined ? { extra: only } : {}
  }

  const data: LogData = {}
  const last = optionalParams.at(-1)

  if (typeof last === "string" && last.length > 0) {
    // Standard NestJS Logger convention: `this.context` is appended as the trailing string.
    data.context = last
    const rest = optionalParams.slice(0, -1).filter(item => item !== undefined)
    if (rest.length === 1) {
      const [item] = rest
      if (isErrorInstance(item)) {
        data.err = item
      } else {
        data.extra = item
      }
    } else if (rest.length > 1) {
      data.extra = rest
    }
    return data
  }

  // Fallback for direct `(msg, context, extra)` callers passing context first.
  const [first, ...rest] = optionalParams
  if (typeof first === "string" && first.length > 0) {
    data.context = first
    const definedRest = rest.filter(item => item !== undefined)
    if (definedRest.length === 1) {
      data.extra = definedRest[0]
    } else if (definedRest.length > 1) {
      data.extra = definedRest
    }
    return data
  }

  const defined = optionalParams.filter(item => item !== undefined)
  if (defined.length > 0) {
    data.extra = defined
  }
  return data
}

function parseErrorParams(message: unknown, optionalParams: unknown[], errorMode: ErrorMode): LogData {
  const data: LogData = {}
  if (isErrorInstance(message)) {
    data.err = message
  }

  if (optionalParams.length === 0) {
    return data
  }

  if (optionalParams.length === 1) {
    const [only] = optionalParams
    if (isErrorInstance(only)) {
      data.err = only
    } else if (isStackString(only)) {
      if (errorMode !== "safe") {
        data.stack = only
      }
    } else if (typeof only === "string" && only.length > 0) {
      data.context = only
    } else if (only !== undefined) {
      data.extra = only
    }
    return data
  }

  const last = optionalParams.at(-1)
  let remaining = optionalParams
  if (typeof last === "string" && last.length > 0 && !isStackString(last)) {
    data.context = last
    remaining = optionalParams.slice(0, -1)
  }

  const extras: unknown[] = []
  for (const item of remaining) {
    if (item === undefined) {
      continue
    }
    if (isErrorInstance(item)) {
      data.err = item
    } else if (typeof item === "string" && item.length > 0) {
      if (errorMode !== "safe") {
        data.stack = item
      }
    } else {
      extras.push(item)
    }
  }

  if (extras.length === 1) {
    data.extra = extras[0]
  } else if (extras.length > 1) {
    data.extra = extras
  }

  return data
}

type NestAdapterConstructor<T extends NestJSLoggerAdapter> = new (logger: LoggerClass) => T

/**
 * NestJS adapter wrapping an immutable {@link LoggerClass}.
 */
export class NestJSLoggerAdapter {
  readonly logger: LoggerClass

  constructor(loggerOrOptions?: LoggerClass | LoggerOptions) {
    this.logger = isLoggerClass(loggerOrOptions) ? loggerOrOptions : createLogger(loggerOrOptions)
    Object.defineProperty(this, NEST_ADAPTER_BRAND, { value: true })
  }

  /**
   * Register a shared root {@link LoggerClass} provider in a `@Global()` module (exporting
   * {@link NEST_ROOT_LOGGER}) so every `forFeature()` module reuses one underlying Pino stream.
   */
  static forRootProvider(logger: LoggerClass): ValueProvider<LoggerClass> {
    return {
      provide: NEST_ROOT_LOGGER,
      useValue: logger,
    }
  }

  /**
   * Create a NestJS module provider scoped to `module`.
   * Reuses the injected `NEST_ROOT_LOGGER` or explicit `parent` logger when provided.
   */
  static forFeature(module: string): FactoryProvider<NestJSLoggerAdapter>
  static forFeature<T extends NestJSLoggerAdapter = NestJSLoggerAdapter>(
    module: string,
    useClass: NestAdapterConstructor<T>,
    parent?: LoggerClass | NestJSLoggerAdapter
  ): FactoryProvider<T>
  static forFeature(
    module: string,
    useClass: NestAdapterConstructor<NestJSLoggerAdapter> = NestJSLoggerAdapter,
    parent?: LoggerClass | NestJSLoggerAdapter
  ): FactoryProvider<NestJSLoggerAdapter> {
    if (parent) {
      const baseLogger = isNestJSLoggerAdapter(parent) ? parent.logger : parent
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
    const forwardStandard =
      (level: ActiveLogLevel) =>
      (message: unknown, ...optionalParams: unknown[]) => {
        const formatted = formatNestMessage(message, this.logger.errorMode)
        const parsed = parseStandardParams(optionalParams)
        const data = formatted.objectPayload ? { ...formatted.objectPayload, ...parsed } : parsed
        this.logger[level](formatted.text, Object.keys(data).length > 0 ? data : undefined)
      }

    const forwardError =
      (level: "error" | "fatal") =>
      (message: unknown, ...optionalParams: unknown[]) => {
        const formatted = formatNestMessage(message, this.logger.errorMode)
        const parsed = parseErrorParams(message, optionalParams, this.logger.errorMode)
        const data = formatted.objectPayload ? { ...formatted.objectPayload, ...parsed } : parsed
        this.logger[level](formatted.text, Object.keys(data).length > 0 ? data : undefined)
      }

    return {
      log: forwardStandard("info"),
      error: forwardError("error"),
      warn: forwardStandard("warn"),
      debug: forwardStandard("debug"),
      verbose: forwardStandard("trace"),
      fatal: forwardError("fatal"),
    }
  }

  /**
   * Derive an immutable child adapter with the `module` binding set, preserving subclasses.
   */
  withModule(module: string): this {
    const AdapterCtor = this.constructor as NestAdapterConstructor<this>
    return new AdapterCtor(this.logger.withModule(module))
  }

  /**
   * Derive an immutable child adapter with the `context` binding set, preserving subclasses.
   */
  withContext(context: string): this {
    const AdapterCtor = this.constructor as NestAdapterConstructor<this>
    return new AdapterCtor(this.logger.withContext(context))
  }

  /**
   * Derive an immutable child adapter with additional static bindings merged, preserving subclasses.
   */
  withBindings(bindings: LogData): this {
    const AdapterCtor = this.constructor as NestAdapterConstructor<this>
    return new AdapterCtor(this.logger.withBindings(bindings))
  }

  /**
   * Fork this adapter while preserving all bindings and subclasses.
   */
  fork(): this {
    const AdapterCtor = this.constructor as NestAdapterConstructor<this>
    return new AdapterCtor(this.logger.fork())
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
