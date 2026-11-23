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
      const merged = parent ? ({ ...parent, ...fields } as T) : fields
      return storage.run(merged, fn)
    },
    get(): T | undefined {
      return storage.getStore()
    },
    mixin: (): LogData => storage.getStore() ?? {},
  }
}
