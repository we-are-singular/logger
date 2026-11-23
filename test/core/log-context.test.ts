import { createLogContext, createMemoryLogger } from "../../src/index"

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe("AsyncLocalStorage log context", () => {
  it("isolates concurrent async flows cleanly when used as a logger mixin", async () => {
    const ctx = createLogContext<{ requestId: string; tenantId?: string }>()
    const { logger, records } = createMemoryLogger({
      app: "Api",
      mixin: ctx.mixin,
    })

    expect(ctx.get()).toBeUndefined()
    expect(ctx.mixin()).toEqual({})

    await Promise.all([
      ctx.run({ requestId: "req-A", tenantId: "tenant-1" }, async () => {
        logger.info("start A", { step: 1 })
        await delay(25)
        logger.info("end A", { step: 2 })
      }),
      ctx.run({ requestId: "req-B", tenantId: "tenant-2" }, async () => {
        await delay(10)
        logger.info("start B", { step: 1 })
        await delay(5)
        logger.info("end B", { step: 2 })
      }),
    ])

    const aLogs = records.filter(r => String(r.message).endsWith("A"))
    const bLogs = records.filter(r => String(r.message).endsWith("B"))

    expect(aLogs).toHaveLength(2)
    expect(bLogs).toHaveLength(2)
    for (const entry of aLogs) {
      expect(entry).toMatchObject({ requestId: "req-A", tenantId: "tenant-1" })
    }
    for (const entry of bLogs) {
      expect(entry).toMatchObject({ requestId: "req-B", tenantId: "tenant-2" })
    }

    expect(ctx.get()).toBeUndefined()
  })

  it("never mutates the ALS store or caller fields when logging structured payloads, including frozen inputs", () => {
    const ctx = createLogContext<{ requestId: string }>()
    const { logger, records } = createMemoryLogger({ mixin: ctx.mixin })
    const frozenInput = Object.freeze({ requestId: "req-frozen" })

    ctx.run(frozenInput, () => {
      logger.info("first", { orderId: "ord-99", tempFlag: true })
      logger.info("second", { action: "cleanup" })
      logger.info("third")

      expect(ctx.get()).toEqual({ requestId: "req-frozen" })
    })

    expect(frozenInput).toEqual({ requestId: "req-frozen" })
    expect(records).toHaveLength(3)
    expect(records[0]).toMatchObject({ requestId: "req-frozen", orderId: "ord-99", tempFlag: true, message: "first" })
    expect(records[1]).toMatchObject({ requestId: "req-frozen", action: "cleanup", message: "second" })
    expect(records[1]).not.toHaveProperty("orderId")
    expect(records[1]).not.toHaveProperty("tempFlag")
    expect(records[2]).toMatchObject({ requestId: "req-frozen", message: "third" })
    expect(records[2]).not.toHaveProperty("orderId")
    expect(records[2]).not.toHaveProperty("action")
  })

  it("merges nested run() contexts and restores outer fields on exit", () => {
    const ctx = createLogContext<{ requestId?: string; jobId?: string }>()
    const { logger, records } = createMemoryLogger({ mixin: ctx.mixin })

    ctx.run({ requestId: "req-outer" }, () => {
      logger.info("outer before")
      ctx.run({ jobId: "job-inner" }, () => {
        expect(ctx.get()).toEqual({ requestId: "req-outer", jobId: "job-inner" })
        logger.info("inner")
      })
      expect(ctx.get()).toEqual({ requestId: "req-outer" })
      logger.info("outer after")
    })

    expect(records[0]).toMatchObject({ requestId: "req-outer", message: "outer before" })
    expect(records[0]).not.toHaveProperty("jobId")
    expect(records[1]).toMatchObject({ requestId: "req-outer", jobId: "job-inner", message: "inner" })
    expect(records[2]).toMatchObject({ requestId: "req-outer", message: "outer after" })
    expect(records[2]).not.toHaveProperty("jobId")
  })
})
