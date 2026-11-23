import { AsyncLocalStorage } from "node:async_hooks"
import type { LogContext, LogData } from "./types"

/**
 * Create a lightweight, opt-in `AsyncLocalStorage` correlation context that plugs directly
 * into `createLogger({ mixin: ctx.mixin })` for automatic per-request or per-job fields.
 */
export function createLogContext<T extends LogData = LogData>(): LogContext<T> {
  const storage = new AsyncLocalStorage<T>()

  return {
    run<R>(fields: T, fn: () => R): R {
      const parent = storage.getStore()
      // Shallow-clone fields so external mutations or frozen inputs never corrupt the store.
      const merged = parent ? ({ ...parent, ...fields } as T) : ({ ...fields } as T)
      return storage.run(merged, fn)
    },
    get(): T | undefined {
      return storage.getStore()
    },
    mixin: (): LogData => {
      const store = storage.getStore()
      // Pino merges log payloads into the mixin return value in place via Object.assign,
      // so always return a fresh shallow copy to keep the ALS store immutable across logs.
      return store ? { ...store } : {}
    },
  }
}
