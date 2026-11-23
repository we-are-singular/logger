import fastify from "fastify"
import { FastifyLoggerAdapter, createFastifyLogger } from "../../src/adapters/fastify.adapter"
import { createMemoryLogger } from "../../src/index"

describe("Fastify logger adapter", () => {
  it("isolates level mutations from an injected parent logger and creates child loggers with one pino.child call", () => {
    const { logger: rootLogger, records } = createMemoryLogger({
      app: "Gateway",
      module: "Api",
      level: "info",
    })
    const fastifyLogger = createFastifyLogger(rootLogger)

    // Mutating adapter.level must NOT mutate rootLogger.level.
    fastifyLogger.level = "warn"
    expect(fastifyLogger.level).toBe("warn")
    expect(rootLogger.level).toBe("info")

    const childSpy = vi.spyOn(fastifyLogger.logger.pino, "child")
    const reqLogger = fastifyLogger.child({ reqId: "req-42", route: "/health" })

    expect(childSpy).toHaveBeenCalledOnce()
    expect(reqLogger.level).toBe("warn")

    // Level changes on child stay synchronized with child's pino instance without mutating parent.
    reqLogger.level = "debug"
    expect(reqLogger.level).toBe("debug")
    expect(fastifyLogger.level).toBe("warn")

    fastifyLogger.info("parent info suppressed at warn")
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

  it("handles (obj, msg), (msg, obj), printf formatting, Error objects, arrays/primitives, options constructor, and silent()", () => {
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
    fastifyLogger.info([1, 2], "array with msg")
    fastifyLogger.info(99, "primitive with msg")
    fastifyLogger.silent()
    fastifyLogger.flush()

    expect(records).toHaveLength(11)
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
    expect(records[9]).toMatchObject({ level: "info", value: [1, 2], message: "array with msg" })
    expect(records[9]).not.toHaveProperty("0")
    expect(records[10]).toMatchObject({ level: "info", value: 99, message: "primitive with msg" })

    // Verify LoggerOptions constructor overload works identically to createFastifyLogger(options).
    const lines: string[] = []
    const fromOptions = new FastifyLoggerAdapter({
      app: "OptFastify",
      module: "Edge",
      format: "json",
      sync: true,
      destination: {
        write(chunk: string) {
          lines.push(chunk)
        },
      },
    })
    fromOptions.info("options ctor ok")
    expect(JSON.parse(lines[0]!)).toMatchObject({ app: "OptFastify", module: "Edge", message: "options ctor ok" })
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

  it("enforces errorMode: safe across direct calls and real Fastify v5 thrown route errors", async () => {
    const { logger, records } = createMemoryLogger({
      app: "SafeGateway",
      errorMode: "safe",
      level: "info",
    })
    const fastifyLogger = createFastifyLogger(logger)

    const secretErr = Object.assign(new Error("postgres://admin:TOPSECRET@db.internal/prod"), {
      code: "ECONNREFUSED",
      sql: "SELECT * FROM secrets",
    })

    fastifyLogger.error(secretErr)
    fastifyLogger.error({ err: secretErr })
    fastifyLogger.error({ cause: secretErr }, "wrapped cause")

    const app = fastify({
      loggerInstance: fastifyLogger,
    })
    app.get("/boom", async () => {
      throw Object.assign(new Error("ROUTE_SECRET_TOKEN_LEAK"), { code: "E_ROUTE" })
    })

    const res = await app.inject({ method: "GET", url: "/boom" })
    await app.close()

    expect(res.statusCode).toBe(500)

    const serialized = JSON.stringify(records)
    expect(serialized).not.toContain("TOPSECRET")
    expect(serialized).not.toContain("SELECT * FROM secrets")
    expect(serialized).not.toContain("ROUTE_SECRET_TOKEN_LEAK")
    expect(serialized).not.toContain('"stack"')

    expect(records[0]).toMatchObject({
      message: "Error",
      err: { type: "Error", code: "ECONNREFUSED" },
    })
    expect(records[1]).toMatchObject({
      err: { type: "Error", code: "ECONNREFUSED" },
    })
    expect(records[2]).toMatchObject({
      message: "wrapped cause",
      cause: { type: "Error", code: "ECONNREFUSED" },
    })

    const routeErrLog = records.find(r => (r.err as { code?: string } | undefined)?.code === "E_ROUTE")
    expect(routeErrLog?.err).toEqual({ type: "Error", code: "E_ROUTE" })
  })
})
