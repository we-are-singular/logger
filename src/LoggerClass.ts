import type { ChildLoggerOptions } from "pino"
import { getLogger } from "./pino.instance"

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

  fork(bindings?: Record<string, unknown>, options?: ChildLoggerOptions) {
    const forked = new LoggerClass(this.app, this.module, this.context)
    if (bindings) {
      forked.pino = this.pino.child(bindings, options)
    }
    return forked
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
}
