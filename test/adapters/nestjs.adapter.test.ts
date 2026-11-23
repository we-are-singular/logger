import { NEST_ROOT_LOGGER, NestJSLoggerAdapter, createNestJSLogger } from "../../src/adapters/nestjs.adapter"
import { createMemoryLogger } from "../../src/index"

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

  it("maps NestJS forRoot() levels cleanly", () => {
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

  it("derives immutable children and shares the root Pino stream in forFeature()", () => {
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

    // Verify DI provider helpers share the single root Pino stream.
    const rootProvider = NestJSLoggerAdapter.forRootProvider(logger)
    expect(rootProvider.provide).toBe(NEST_ROOT_LOGGER)
    expect(rootProvider.useValue).toBe(logger)

    const featureFromInjected = NestJSLoggerAdapter.forFeature("Orders")
    const injectedInstance = featureFromInjected.useFactory(rootProvider.useValue)
    injectedInstance.info("from injected root")

    const featureFromParent = NestJSLoggerAdapter.forFeature("Shipping", NestJSLoggerAdapter, parent)
    const explicitInstance = featureFromParent.useFactory()
    explicitInstance.error("from explicit parent")

    expect(records[5]).toMatchObject({ app: "NestApp", module: "Orders", message: "from injected root" })
    expect(records[6]).toMatchObject({ app: "NestApp", module: "Shipping", message: "from explicit parent" })
  })
})
