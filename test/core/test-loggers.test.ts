import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import pino from "pino"
import { createLogger, createMemoryLogger, createNoopLogger } from "../../src/index"

describe("test loggers and flush", () => {
  it("captures structured records synchronously and clears them in createMemoryLogger()", () => {
    const memory = createMemoryLogger({ app: "TestApp", level: "trace" })
    const child = memory.logger.withModule("Payments")

    memory.logger.info("started")
    child.debug("charged", { amount: 500 })

    expect(memory.records).toHaveLength(2)
    expect(memory.records[0]).toMatchObject({ app: "TestApp", level: "info", message: "started" })
    expect(memory.records[1]).toMatchObject({
      app: "TestApp",
      module: "Payments",
      level: "debug",
      message: "charged",
      amount: 500,
    })

    memory.clear()
    expect(memory.records).toHaveLength(0)
  })

  it("emits nothing and skips thunks in createNoopLogger()", () => {
    const logger = createNoopLogger()
    const thunk = vi.fn<() => { heavy: boolean }>(() => ({ heavy: true }))

    expect(logger.level).toBe("silent")
    expect(logger.isLevelEnabled("trace")).toBe(false)
    expect(logger.isLevelEnabled("fatal")).toBe(false)

    logger.trace("ignored", thunk)
    logger.fatal("ignored", thunk)
    logger.withModule("Child").error("ignored", thunk)
    logger.flush()

    expect(thunk).not.toHaveBeenCalled()
  })

  it("flushes buffered destination output cleanly via flush()", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "singular-logger-flush-"))
    const logFile = path.join(tempDir, "buffered.ndjson")

    try {
      const destination = pino.destination({ dest: logFile, minLength: 4096, sync: false })
      const logger = createLogger({
        app: "FlushApp",
        format: "json",
        level: "info",
        destination,
      })

      logger.info("buffered message", { step: 1 })
      await new Promise<void>((resolve, reject) => {
        logger.flush(err => (err ? reject(err) : resolve()))
      })

      const contents = fs.readFileSync(logFile, "utf8").trim()
      expect(contents.length).toBeGreaterThan(0)
      expect(JSON.parse(contents)).toMatchObject({
        app: "FlushApp",
        level: "info",
        message: "buffered message",
        step: 1,
      })
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
