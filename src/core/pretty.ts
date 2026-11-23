import { createRequire } from "node:module"
import { Writable } from "node:stream"
import type { DestinationStream, LogDescriptor } from "pino"
import type { PrettyOptions } from "pino-pretty"

type PrettyFactory = (options?: PrettyOptions) => DestinationStream

/**
 * Loader hook allowing tests to simulate an unavailable `pino-pretty` module.
 */
export type PrettyModuleLoader = () => PrettyFactory | undefined

const defaultPrettyLoader: PrettyModuleLoader = () => {
  try {
    const require = createRequire(import.meta.url)
    const loaded: unknown = require("pino-pretty")
    if (typeof loaded === "function") {
      return loaded as PrettyFactory
    }
    if (typeof loaded === "object" && loaded !== null && "default" in loaded) {
      const candidate = (loaded as { default?: unknown }).default
      if (typeof candidate === "function") {
        return candidate as PrettyFactory
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

let activePrettyLoader: PrettyModuleLoader = defaultPrettyLoader

/**
 * Override the `pino-pretty` loader in tests.
 * @internal
 */
export function setPrettyLoaderForTesting(loader?: PrettyModuleLoader): void {
  activePrettyLoader = loader ?? defaultPrettyLoader
}

/**
 * Adapt a minimal Pino `DestinationStream` into a Node `Writable` stream when required by `pino-pretty`.
 */
function toWritableDestination(destination: DestinationStream): DestinationStream {
  if (typeof (destination as { on?: unknown }).on === "function") {
    return destination
  }

  return new Writable({
    write(chunk, _encoding, callback) {
      destination.write(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"))
      callback()
    },
  })
}

/**
 * Format `[app::module::context] message` prefixes consistently in pretty mode.
 */
function formatPrettyMessage(log: LogDescriptor, messageKey: string): string {
  const prefix = [log.app, log.module, log.context]
    .filter((segment): segment is string => typeof segment === "string" && segment.length > 0)
    .join("::")
  const rawMessage = log[messageKey]
  const message = rawMessage === undefined ? "" : String(rawMessage)
  return prefix ? `[${prefix}] ${message}` : message
}

export interface CreatePrettyStreamOptions {
  sync: boolean
  destination?: DestinationStream
}

/**
 * Lazily construct a `pino-pretty` destination stream only when pretty formatting is active.
 * Falls back to `undefined` (JSON) if `pino-pretty` cannot be loaded.
 */
export function createPrettyStream(options: CreatePrettyStreamOptions): DestinationStream | undefined {
  const pretty = activePrettyLoader()
  if (!pretty) {
    return undefined
  }

  return pretty({
    minimumLevel: "trace",
    sync: options.sync,
    colorize: true,
    colorizeObjects: true,
    singleLine: false,
    messageKey: "message",
    ignore: "pid,hostname,app,module,context,reqId",
    messageFormat: formatPrettyMessage,
    ...(options.destination ? { destination: toWritableDestination(options.destination) } : {}),
  })
}
