import vm from "node:vm"
import { createMemoryLogger, safeError } from "../../src/index"

class DatabaseConnectionError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = "DatabaseConnectionError"
    this.code = code
  }
}

class GetterCodeError extends Error {
  private readonly innerCode: string

  constructor(message: string, code = "E_PROTOTYPE_GETTER") {
    super(message)
    this.name = "GetterCodeError"
    this.innerCode = code
  }

  get code(): string {
    return this.innerCode
  }
}

describe("error serialization and non-object safety", () => {
  it("preserves type, message, and stack by default (errorMode: full)", () => {
    const { logger, records } = createMemoryLogger()
    const err = new DatabaseConnectionError("postgres://user:pass@db/prod failed", "ECONNREFUSED")

    logger.error("query failed", { err })

    const loggedErr = records[0]?.err as Record<string, unknown>
    expect(loggedErr.type).toBe("DatabaseConnectionError")
    expect(loggedErr.code).toBe("ECONNREFUSED")
    expect(loggedErr.message).toBe("postgres://user:pass@db/prod failed")
    expect(typeof loggedErr.stack).toBe("string")
  })

  it("strips Error.message and stack traces in errorMode: safe without corrupting non-error err/error values", () => {
    const { logger, records } = createMemoryLogger({ errorMode: "safe" })
    const err = new DatabaseConnectionError("secret://token@host/db", "ETIMEDOUT")

    logger.error("via err key", { err })
    logger.error("via error key", { error: err })
    logger.error("via custom key", { cause: err, requestId: "req-1" })
    logger.error("direct error", err as unknown as Record<string, unknown>)
    logger.info("status check", { error: false, err: null })

    expect(records).toHaveLength(5)

    expect(records[0]?.err).toEqual({ type: "DatabaseConnectionError", code: "ETIMEDOUT" })
    expect(records[1]?.error).toEqual({ type: "DatabaseConnectionError", code: "ETIMEDOUT" })
    expect(records[2]?.cause).toEqual({ type: "DatabaseConnectionError", code: "ETIMEDOUT" })
    expect(records[2]?.requestId).toBe("req-1")
    expect(records[3]?.err).toEqual({ type: "DatabaseConnectionError", code: "ETIMEDOUT" })
    expect(records[4]?.error).toBe(false)
    expect(records[4]?.err).toBeNull()

    const serialized = JSON.stringify(records)
    expect(serialized).not.toContain("secret://token@host/db")
    expect(serialized).not.toContain("stack")
  })

  it("extracts safe metadata in safeError() including prototype getters, cross-realm errors, and malformed shapes", () => {
    const withNumCode = Object.assign(new TypeError("sensitive details"), { code: 503 })
    expect(safeError(withNumCode)).toEqual({ type: "TypeError", code: "503" })

    const withNaNCode = Object.assign(new Error("bad num"), { code: Number.NaN })
    expect(safeError(withNaNCode)).toEqual({ type: "Error" })

    const withInfinityCode = Object.assign(new Error("inf"), { code: Number.POSITIVE_INFINITY })
    expect(safeError(withInfinityCode)).toEqual({ type: "Error" })

    expect(safeError(new GetterCodeError("secret getter msg"))).toEqual({
      type: "GetterCodeError",
      code: "E_PROTOTYPE_GETTER",
    })

    const nullCtorErr = Object.assign(Object.create(Error.prototype) as Error, { name: "", constructor: undefined })
    expect(safeError(nullCtorErr)).toEqual({ type: "Error" })

    const vmError = vm.runInNewContext('Object.assign(new RangeError("vm secret"), { code: "E_VM" })') as unknown
    expect(safeError(vmError)).toEqual({ type: "RangeError", code: "E_VM" })

    expect(safeError({ name: "CustomError", code: "E_BAD", message: "secret" })).toEqual({
      type: "CustomError",
      code: "E_BAD",
    })
    expect(safeError({ type: "AlreadySafe", code: "E_SAFE" })).toEqual({
      type: "AlreadySafe",
      code: "E_SAFE",
    })
    expect(safeError("secret error string")).toEqual({ type: "StringError" })
    expect(safeError(null)).toEqual({ type: "UnknownError" })
    expect(safeError(42)).toEqual({ type: "UnknownError" })
  })

  it("safely wraps runtime primitives, null, and arrays without corrupting JSON output", () => {
    const { logger, records } = createMemoryLogger()

    logger.info("string value", "raw-string" as unknown as Record<string, unknown>)
    logger.info("number value", 123 as unknown as Record<string, unknown>)
    logger.info("boolean value", false as unknown as Record<string, unknown>)
    logger.info("null value", null as unknown as Record<string, unknown>)
    logger.info("array value", [1, 2, 3] as unknown as Record<string, unknown>)

    expect(records).toHaveLength(5)
    expect(records[0]).toMatchObject({ message: "string value", value: "raw-string" })
    expect(records[1]).toMatchObject({ message: "number value", value: 123 })
    expect(records[2]).toMatchObject({ message: "boolean value", value: false })
    expect(records[3]).toMatchObject({ message: "null value", value: null })
    expect(records[4]).toMatchObject({ message: "array value", value: [1, 2, 3] })
  })
})
