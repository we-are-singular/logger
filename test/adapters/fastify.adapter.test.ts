import fastify from "fastify"
import { FastifyLoggerAdapter, createFastifyLogger } from "../../src/adapters/fastify.adapter"
import { createMemoryLogger } from "../../src/index"

describe("Fastify logger adapter", () => {
  it("creates child loggers sharing the parent stream without extra allocations and syncs level", () => {
    const { logger, records } = createMemoryLogger({
      app: "Gateway",
      module: "Api",
      level: "info",
    })
    const fastifyLogger = createFastifyLogger(logger)

    const childSpy = vi.spyOn(fastifyLogger.logger.pino, "child")
    const reqLogger = fastifyLogger.child({ reqId: "req-42", route: "/health" })

    expect(childSpy).toHaveBeenCalledOnce()
    expect(reqLogger.level).toBe("info")

    // Level changes on child stay synchronized with child's pino instance without mutating parent.
    reqLogger.level = "debug"
    expect(reqLogger.level).toBe("debug")
    expect(fastifyLogger.level).toBe("info")

    fastifyLogger.debug("parent debug suppressed")
    reqLogger.debug({ latencyMs: 5 }, "child debug allowed")

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      level: "debug",
      app: "Gateway",
      module: "Api",
      reqId: "req-42",
      route: "/health",
      latencyMs: 5,
      message: "child debug allowed",
    })
  })

  it("handles (obj, msg), (msg, obj), printf formatting, Error objects, and silent()", () => {
    const { logger, records } = createMemoryLogger({ level: "trace" })
    const fastifyLogger = new FastifyLoggerAdapter(logger)

    fastifyLogger.trace({ step: 1 }, "trace obj-first")
    fastifyLogger.debug("debug msg-first", { step: 2 })
    fastifyLogger.info("plain string")
    fastifyLogger.info("listening at %s:%d", "127.0.0.1", 3000)
    fastifyLogger.warn({ retries: 3 }, "retrying %s", "webhook")
    fastifyLogger.error(new Error("boom"), "handler failed")
    fastifyLogger.error(new Error("interpolated %s"), "err %s", "detail")
    fastifyLogger.fatal({ code: "E_FATAL" })
    fastifyLogger.info(42)
    fastifyLogger.silent()
    fastifyLogger.flush()

    expect(records).toHaveLength(9)
    expect(records[0]).toMatchObject({ level: "trace", step: 1, message: "trace obj-first" })
    expect(records[1]).toMatchObject({ level: "debug", step: 2, message: "debug msg-first" })
    expect(records[2]).toMatchObject({ level: "info", message: "plain string" })
    expect(records[3]).toMatchObject({ level: "info", message: "listening at 127.0.0.1:3000" })
    expect(records[4]).toMatchObject({ level: "warn", retries: 3, message: "retrying webhook" })
    expect(records[5]).toMatchObject({
      level: "error",
      message: "handler failed",
      err: expect.objectContaining({ message: "boom" }),
    })
    expect(records[6]).toMatchObject({
      level: "error",
      message: "err detail",
      err: expect.objectContaining({ message: "interpolated %s" }),
    })
    expect(records[7]).toMatchObject({ level: "fatal", code: "E_FATAL" })
    expect(records[8]).toMatchObject({ level: "info", value: 42 })
  })

  it("integrates directly with a real Fastify v5 server instance", async () => {
    const { logger, records } = createMemoryLogger({
      app: "FastifyApp",
      module: "Http",
      level: "info",
    })
    const app = fastify({
      loggerInstance: createFastifyLogger(logger),
    })

    app.get("/ping", async req => {
      req.log.info({ handler: "ping" }, "handling ping")
      return { ok: true }
    })

    const response = await app.inject({ method: "GET", url: "/ping" })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })

    const handlerLog = records.find(r => r.message === "handling ping")
    expect(handlerLog).toBeDefined()
    expect(handlerLog).toMatchObject({
      app: "FastifyApp",
      module: "Http",
      handler: "ping",
      level: "info",
    })
    expect(typeof handlerLog?.reqId).toBe("string")
  })
})
