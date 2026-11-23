import { createMemoryLogger } from "../../src/index"
import type { ActiveLogLevel } from "../../src/index"

describe("levels and lazy evaluation", () => {
  const orderedLevels: ActiveLogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"]

  it("filters records accurately across all log levels", () => {
    const { logger, records } = createMemoryLogger({ level: "warn" })

    logger.trace("trace msg")
    logger.debug("debug msg")
    logger.info("info msg")
    logger.warn("warn msg")
    logger.error("error msg")
    logger.fatal("fatal msg")

    expect(records.map(r => r.level)).toEqual(["warn", "error", "fatal"])
    expect(records.map(r => r.message)).toEqual(["warn msg", "error msg", "fatal msg"])
  })

  it("reports isLevelEnabled accurately for each configured threshold", () => {
    const { logger } = createMemoryLogger({ level: "info" })

    expect(logger.level).toBe("info")
    expect(logger.isLevelEnabled("trace")).toBe(false)
    expect(logger.isLevelEnabled("debug")).toBe(false)
    expect(logger.isLevelEnabled("info")).toBe(true)
    expect(logger.isLevelEnabled("warn")).toBe(true)
    expect(logger.isLevelEnabled("error")).toBe(true)
    expect(logger.isLevelEnabled("fatal")).toBe(true)
  })

  it("suppresses all records and disables every level when level is silent", () => {
    const { logger, records } = createMemoryLogger({ level: "silent" })

    for (const level of orderedLevels) {
      expect(logger.isLevelEnabled(level)).toBe(false)
      logger[level](`${level} suppressed`)
    }

    expect(records).toHaveLength(0)
  })

  it("does not invoke lazy data thunks when the target level is disabled", () => {
    const { logger, records } = createMemoryLogger({ level: "info" })
    const traceThunk = vi.fn<() => { expensive: string }>(() => ({ expensive: "trace-snapshot" }))
    const debugThunk = vi.fn<() => { expensive: string }>(() => ({ expensive: "debug-snapshot" }))
    const infoThunk = vi.fn<() => { expensive: string }>(() => ({ expensive: "info-snapshot" }))

    logger.trace("trace skipped", traceThunk)
    logger.debug("debug skipped", debugThunk)
    logger.info("info emitted", infoThunk)

    expect(traceThunk).not.toHaveBeenCalled()
    expect(debugThunk).not.toHaveBeenCalled()
    expect(infoThunk).toHaveBeenCalledOnce()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      level: "info",
      message: "info emitted",
      expensive: "info-snapshot",
    })
  })

  it("emits clean records when data is omitted or a thunk returns undefined", () => {
    const { logger, records } = createMemoryLogger({ level: "info" })

    logger.info("no data")
    logger.info("undefined thunk", () => undefined as unknown as Record<string, unknown>)

    expect(records).toHaveLength(2)
    expect(records[0]?.message).toBe("no data")
    expect(records[0]).not.toHaveProperty("value")
    expect(records[1]?.message).toBe("undefined thunk")
    expect(records[1]).not.toHaveProperty("value")
  })
})
