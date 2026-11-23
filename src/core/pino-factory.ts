import pino, {
  stdSerializers,
  stdTimeFunctions,
  type DestinationStream,
  type Logger as PinoLogger,
  type LoggerOptions as PinoLoggerOptions,
} from "pino"
import { resolveLoggerConfig, sanitizeSafeRecord, serializeSafeError } from "./config"
import { createPrettyStream } from "./pretty"
import type { ErrorMode, LogData, LoggerOptions } from "./types"

function buildInitialBindings(options: LoggerOptions, errorMode: ErrorMode): LogData | undefined {
  const bindings: LogData = {
    ...options.bindings,
    ...(options.app ? { app: options.app } : {}),
    ...(options.module ? { module: options.module } : {}),
    ...(options.context ? { context: options.context } : {}),
  }

  if (Object.keys(bindings).length === 0) {
    return undefined
  }

  return errorMode === "safe" ? sanitizeSafeRecord(bindings) : bindings
}

export interface CreatedPinoRoot {
  rootPino: PinoLogger
  pino: PinoLogger
  bindings: LogData
  errorMode: ErrorMode
}

/**
 * Construct a configured root Pino instance and apply initial static bindings as a child.
 */
export function createRootPino(options: LoggerOptions): CreatedPinoRoot {
  const config = resolveLoggerConfig(options)

  const mixin = options.mixin
  const safeMixin = mixin && config.errorMode === "safe" ? (): LogData => sanitizeSafeRecord(mixin()) : mixin

  const pinoOptions: PinoLoggerOptions = {
    level: config.level,
    timestamp: stdTimeFunctions.isoTime,
    messageKey: "message",
    formatters: {
      level: label => ({ level: label }),
    },
    serializers:
      config.errorMode === "safe"
        ? { err: serializeSafeError, error: serializeSafeError }
        : { err: stdSerializers.err, error: stdSerializers.err },
    ...(config.redact ? { redact: config.redact } : {}),
    ...(safeMixin ? { mixin: safeMixin } : {}),
  }

  let destination: DestinationStream | undefined
  if (config.format === "pretty") {
    // Load pino-pretty lazily so JSON mode pays zero pretty-formatter startup cost.
    destination = createPrettyStream({
      sync: config.sync,
      destination: options.destination,
    })
  }

  if (!destination) {
    if (options.destination) {
      destination = options.destination
    } else if (config.sync) {
      destination = pino.destination({ fd: 1, sync: true })
    }
  }

  const rootPino = destination ? pino(pinoOptions, destination) : pino(pinoOptions)
  const initialBindings = buildInitialBindings(options, config.errorMode)
  const instance = initialBindings ? rootPino.child(initialBindings) : rootPino

  return {
    rootPino,
    pino: instance,
    bindings: initialBindings ?? {},
    errorMode: config.errorMode,
  }
}
