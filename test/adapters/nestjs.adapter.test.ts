import { Logger as NestLogger } from "@nestjs/common"
import type { DestinationStream } from "pino"
import { NEST_ROOT_LOGGER, NestJSLoggerAdapter, createNestJSLogger } from "../../src/adapters/nestjs.adapter"
import { createLogger, createMemoryLogger } from "../../src/index"

class CustomNestLogger extends NestJSLoggerAdapter {
  customTag(): string {
    return "custom-subclass"
  }
}

describe("NestJS logger adapter", () => {
  it("fixes v2 error(msg, undefined, context) bug and includes stack only when defined", () => {
    const { logger, records } = createMemoryLogger({ app: "NestApp", level: "trace" })
    const nestRoot = createNestJSLogger(logger).forRoot()

    nestRoot.error("Database unreachable")
    nestRoot.error("User lookup failed", undefined, "UsersService")
    nestRoot.error("Unexpected crash", "Error: boom\n    at UsersService.find", "UsersService")
    nestRoot.error(new Error("Connection reset"), undefined, "DbModule")

    expect(records).toHaveLength(4)

    expect(records[0]).toMatchObject({ level: "error", message: "Database unreachable" })
    expect(records[0]).not.toHaveProperty("stack")
    expect(records[0]).not.toHaveProperty("context")

    expect(records[1]).toMatchObject({
      level: "error",
      message: "User lookup failed",
      context: "UsersService",
    })
    expect(records[1]).not.toHaveProperty("stack")

    expect(records[2]).toMatchObject({
      level: "error",
      message: "Unexpected crash",
      context: "UsersService",
      stack: "Error: boom\n    at UsersService.find",
    })

    expect(records[3]).toMatchObject({
      level: "error",
      message: "Connection reset",
      context: "DbModule",
      err: expect.objectContaining({ message: "Connection reset" }),
    })
  })

  it("handles real @nestjs/common Logger calls with context, payloads, errors, and static error(msg, context)", () => {
    const { logger, records } = createMemoryLogger({ app: "NestReal", level: "trace" })
    NestLogger.overrideLogger(createNestJSLogger(logger).forRoot())

    try {
      const svcLogger = new NestLogger("UsersService")
      svcLogger.log("User created", { userId: "u-1" })
      svcLogger.log({ message: "From object", userId: "u-2" })
      svcLogger.log({ event: "no-msg-key" })
      svcLogger.warn("Slow query", { ms: 420 })
      svcLogger.warn(Object.assign(new Error("warn boom"), { code: "E_WARN" }))
      svcLogger.debug("Cache hit", { key: "users:1" })
      svcLogger.verbose("Verbose step")
      svcLogger.error("Query failed", new Error("db timeout"))
      svcLogger.fatal("Crash", "Error: fatal\n    at App.run (app.ts:10:5)")
      NestLogger.error("Static bootstrap failure", "Bootstrap")
    } finally {
      NestLogger.overrideLogger(false)
    }

    expect(records).toHaveLength(10)
    expect(records[0]).toMatchObject({
      level: "info",
      message: "User created",
      context: "UsersService",
      extra: { userId: "u-1" },
    })
    expect(records[1]).toMatchObject({
      level: "info",
      message: "From object",
      userId: "u-2",
      context: "UsersService",
    })
    expect(records[2]).toMatchObject({
      level: "info",
      event: "no-msg-key",
      context: "UsersService",
    })
    expect(records[2]).not.toHaveProperty("message")
    expect(records[3]).toMatchObject({
      level: "warn",
      message: "Slow query",
      context: "UsersService",
      extra: { ms: 420 },
    })
    expect(records[4]).toMatchObject({
      level: "warn",
      message: "warn boom",
      context: "UsersService",
      err: expect.objectContaining({ message: "warn boom", code: "E_WARN" }),
    })
    expect(records[5]).toMatchObject({
      level: "debug",
      message: "Cache hit",
      context: "UsersService",
      extra: { key: "users:1" },
    })
    expect(records[6]).toMatchObject({
      level: "trace",
      message: "Verbose step",
      context: "UsersService",
    })
    expect(records[7]).toMatchObject({
      level: "error",
      message: "Query failed",
      context: "UsersService",
      err: expect.objectContaining({ message: "db timeout" }),
    })
    expect(records[8]).toMatchObject({
      level: "fatal",
      message: "Crash",
      context: "UsersService",
      stack: "Error: fatal\n    at App.run (app.ts:10:5)",
    })
    expect(records[9]).toMatchObject({
      level: "error",
      message: "Static bootstrap failure",
      context: "Bootstrap",
    })
    expect(records[9]).not.toHaveProperty("stack")

    // Verify raw NDJSON has no duplicate "message" key when logging an object with { message }.
    const rawLines: string[] = []
    const dest: DestinationStream = {
      write(chunk: string) {
        rawLines.push(chunk)
      },
    }
    const rawNest = createNestJSLogger(createLogger({ format: "json", sync: true, destination: dest })).forRoot()
    rawNest.log({ message: "single-key", ok: true }, "RawCtx")
    expect(rawLines[0]!.match(/"message":/g)).toHaveLength(1)
    expect(JSON.parse(rawLines[0]!)).toMatchObject({ message: "single-key", ok: true, context: "RawCtx" })
  })

  it("enforces errorMode: safe in forRoot().error() and fatal() without leaking message or stack", () => {
    const { logger, records } = createMemoryLogger({ errorMode: "safe", level: "trace" })
    const nestRoot = createNestJSLogger(logger).forRoot()
    const secretErr = Object.assign(new Error("postgres://admin:SECRET@db/prod"), { code: "E_DB" })

    nestRoot.error(secretErr, secretErr.stack, "DbModule")
    nestRoot.error("crash", "Error: SECRET_STACK\n    at secret.ts:12:3", "Worker")
    nestRoot.error("nested extra err", { err: secretErr }, "UsersService")
    nestRoot.fatal?.(secretErr, "Error: FATAL_SECRET\n    at main.ts:1:1", "Bootstrap")

    expect(records).toHaveLength(4)
    const serialized = JSON.stringify(records)
    expect(serialized).not.toContain("postgres://admin:SECRET@db/prod")
    expect(serialized).not.toContain("SECRET_STACK")
    expect(serialized).not.toContain("FATAL_SECRET")
    expect(serialized).not.toContain('"stack"')

    expect(records[0]).toMatchObject({
      level: "error",
      message: "Error",
      context: "DbModule",
      err: { type: "Error", code: "E_DB" },
    })
    expect(records[1]).toMatchObject({
      level: "error",
      message: "crash",
      context: "Worker",
    })
    expect(records[2]).toMatchObject({
      level: "error",
      message: "nested extra err",
      context: "UsersService",
      extra: { err: { type: "Error", code: "E_DB" } },
    })
    expect(records[3]).toMatchObject({
      level: "fatal",
      message: "Error",
      context: "Bootstrap",
      err: { type: "Error", code: "E_DB" },
    })
  })

  it("maps direct NestJS forRoot() calls cleanly", () => {
    const { logger, records } = createMemoryLogger({ level: "trace" })
    const nestRoot = new NestJSLoggerAdapter(logger).forRoot()

    nestRoot.log("booted", "NestFactory", { port: 3000 })
    nestRoot.log("plain log")
    nestRoot.warn("deprecated route", "Router")
    nestRoot.warn("plain warn")
    nestRoot.debug?.("cache hit", "CacheService")
    nestRoot.debug?.("plain debug")
    nestRoot.verbose?.("trace detail", "VerboseService")
    nestRoot.verbose?.("plain verbose")
    nestRoot.fatal?.("unrecoverable", "Bootstrap")
    nestRoot.fatal?.("plain fatal")

    expect(records.map(r => r.level)).toEqual([
      "info",
      "info",
      "warn",
      "warn",
      "debug",
      "debug",
      "trace",
      "trace",
      "fatal",
      "fatal",
    ])
    expect(records[0]).toMatchObject({ message: "booted", context: "NestFactory", extra: { port: 3000 } })
    expect(records[1]).toMatchObject({ message: "plain log" })
    expect(records[1]).not.toHaveProperty("context")
    expect(records[2]).toMatchObject({ message: "deprecated route", context: "Router" })
    expect(records[3]).not.toHaveProperty("context")
    expect(records[4]).toMatchObject({ message: "cache hit", context: "CacheService" })
    expect(records[5]).not.toHaveProperty("context")
    expect(records[6]).toMatchObject({ message: "trace detail", context: "VerboseService" })
    expect(records[7]).not.toHaveProperty("context")
    expect(records[8]).toMatchObject({ message: "unrecoverable", context: "Bootstrap" })
    expect(records[9]).not.toHaveProperty("context")
  })

  it("derives immutable children, preserves subclasses, and shares the root Pino stream in forFeature()", () => {
    const { logger, records } = createMemoryLogger({ app: "NestApp", level: "trace" })
    const parent = createNestJSLogger(logger)

    expect(parent.level).toBe("trace")

    const modLogger = parent.withModule("Billing")
    const ctxLogger = modLogger.withContext("BillingService")
    const boundLogger = ctxLogger.withBindings({ tenantId: "t-1" })
    const forked = boundLogger.fork()

    parent.log("parent")
    modLogger.warn("module")
    ctxLogger.debug("context")
    boundLogger.verbose("bound")
    forked.fatal("forked")
    forked.flush()

    expect(records[0]).not.toHaveProperty("module")
    expect(records[1]).toMatchObject({ app: "NestApp", module: "Billing", level: "warn" })
    expect(records[2]).toMatchObject({ app: "NestApp", module: "Billing", context: "BillingService", level: "debug" })
    expect(records[3]).toMatchObject({
      app: "NestApp",
      module: "Billing",
      context: "BillingService",
      tenantId: "t-1",
      level: "trace",
    })
    expect(records[4]).toMatchObject({
      app: "NestApp",
      module: "Billing",
      context: "BillingService",
      tenantId: "t-1",
      level: "fatal",
    })

    // Verify DI provider helpers share the single root Pino stream and preserve subclasses.
    const rootProvider = NestJSLoggerAdapter.forRootProvider(logger)
    expect(rootProvider.provide).toBe(NEST_ROOT_LOGGER)
    expect(rootProvider.useValue).toBe(logger)

    const featureFromInjected = NestJSLoggerAdapter.forFeature("Orders")
    const injectedInstance = featureFromInjected.useFactory(rootProvider.useValue) as NestJSLoggerAdapter
    injectedInstance.info("from injected root")

    const featureWithUndefinedClass = NestJSLoggerAdapter.forFeature("Inventory", undefined, logger)
    const inventoryInstance = featureWithUndefinedClass.useFactory() as NestJSLoggerAdapter
    inventoryInstance.info("from explicit root logger")

    const customFeature = NestJSLoggerAdapter.forFeature("Shipping", CustomNestLogger, parent)
    const customInstance = customFeature.useFactory() as CustomNestLogger
    const customChild = customInstance.withContext("ShippingService").withBindings({ carrier: "dhl" }).fork()

    expect(customInstance).toBeInstanceOf(CustomNestLogger)
    expect(customChild).toBeInstanceOf(CustomNestLogger)
    expect(customChild.customTag()).toBe("custom-subclass")
    customChild.error("from subclass")

    expect(records[5]).toMatchObject({ app: "NestApp", module: "Orders", message: "from injected root" })
    expect(records[6]).toMatchObject({ app: "NestApp", module: "Inventory", message: "from explicit root logger" })
    expect(records[7]).toMatchObject({
      app: "NestApp",
      module: "Shipping",
      context: "ShippingService",
      carrier: "dhl",
      message: "from subclass",
    })
  })
})
