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
        logger.info("start A")
        await delay(25)
        logger.info("end A")
      }),
      ctx.run({ requestId: "req-B", tenantId: "tenant-2" }, async () => {
        await delay(10)
        logger.info("start B")
        await delay(5)
        logger.info("end B")
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
