import type { DestinationStream } from "pino"
import { resolveFormat, resolveLevel, resolveLoggerConfig } from "../../src/core/config"
import { createLogger } from "../../src/index"
import type { LogFormat, LogLevel } from "../../src/index"

function createCaptureStream(): { destination: DestinationStream; lines: string[] } {
  const lines: string[] = []
  return {
    lines,
    destination: {
      write(chunk: string) {
        lines.push(chunk)
      },
    },
  }
}

describe("config precedence and formatting", () => {
  it.each<{
    name: string
    optionFormat?: LogFormat
    env: Record<string, string | undefined>
    expected: LogFormat
  }>([
    {
      name: "options.format overrides LOG_FORMAT, LOG_HUMAN, and NODE_ENV",
      optionFormat: "json",
      env: { LOG_FORMAT: "pretty", LOG_HUMAN: "1", NODE_ENV: "development" },
      expected: "json",
    },
    {
      name: "options.format pretty overrides production JSON default",
      optionFormat: "pretty",
      env: { LOG_FORMAT: "json", LOG_HUMAN: "0", NODE_ENV: "production" },
      expected: "pretty",
    },
    {
      name: "LOG_FORMAT=json overrides LOG_HUMAN=1 in development",
      env: { LOG_FORMAT: "json", LOG_HUMAN: "1", NODE_ENV: "development" },
      expected: "json",
    },
    {
      name: "LOG_FORMAT=json works in test",
      env: { LOG_FORMAT: "json", NODE_ENV: "test" },
      expected: "json",
    },
    {
      name: "LOG_FORMAT=pretty overrides production",
      env: { LOG_FORMAT: "PRETTY", LOG_HUMAN: "0", NODE_ENV: "production" },
      expected: "pretty",
    },
    {
      name: "LOG_HUMAN=1 selects pretty in production",
      env: { LOG_HUMAN: "1", NODE_ENV: "production" },
      expected: "pretty",
    },
    {
      name: "LOG_HUMAN=true selects pretty in production",
      env: { LOG_HUMAN: "true", NODE_ENV: "production" },
      expected: "pretty",
    },
    {
      name: "LOG_HUMAN=0 selects json in development",
      env: { LOG_HUMAN: "0", NODE_ENV: "development" },
      expected: "json",
    },
    {
      name: "LOG_HUMAN=false selects json in test",
      env: { LOG_HUMAN: "false", NODE_ENV: "test" },
      expected: "json",
    },
    {
      name: "NODE_ENV=production defaults to json",
      env: { NODE_ENV: "production" },
      expected: "json",
    },
    {
      name: "NODE_ENV=development defaults to pretty",
      env: { NODE_ENV: "development" },
      expected: "pretty",
    },
    {
      name: "NODE_ENV=test defaults to pretty",
      env: { NODE_ENV: "test" },
      expected: "pretty",
    },
    {
      name: "invalid LOG_FORMAT falls through to LOG_HUMAN",
      env: { LOG_FORMAT: "xml", LOG_HUMAN: "0", NODE_ENV: "development" },
      expected: "json",
    },
  ])("$name", ({ optionFormat, env, expected }) => {
    expect(resolveFormat({ format: optionFormat }, env)).toBe(expected)
  })

  it.each<{
    name: string
    optionLevel?: LogLevel
    env: Record<string, string | undefined>
    expected: LogLevel
  }>([
    {
      name: "options.level overrides LOG_LEVEL and NODE_ENV",
      optionLevel: "warn",
      env: { LOG_LEVEL: "trace", NODE_ENV: "development" },
      expected: "warn",
    },
    {
      name: "valid LOG_LEVEL overrides NODE_ENV default",
      env: { LOG_LEVEL: "ERROR", NODE_ENV: "development" },
      expected: "error",
    },
    {
      name: "invalid LOG_LEVEL is ignored cleanly in production",
      env: { LOG_LEVEL: "loud", NODE_ENV: "production" },
      expected: "info",
    },
    {
      name: "invalid LOG_LEVEL is ignored cleanly in development",
      env: { LOG_LEVEL: "not-a-level", NODE_ENV: "development" },
      expected: "debug",
    },
    {
      name: "NODE_ENV=production defaults to info",
      env: { NODE_ENV: "production" },
      expected: "info",
    },
    {
      name: "NODE_ENV=development defaults to debug",
      env: { NODE_ENV: "development" },
      expected: "debug",
    },
    {
      name: "NODE_ENV=test defaults to debug",
      env: { NODE_ENV: "test" },
      expected: "debug",
    },
  ])("$name", ({ optionLevel, env, expected }) => {
    expect(resolveLevel({ level: optionLevel }, env)).toBe(expected)
  })

  it("resolves sync=true in test and sync=false otherwise unless overridden", () => {
    expect(resolveLoggerConfig({ env: { NODE_ENV: "test" } }).sync).toBe(true)
    expect(resolveLoggerConfig({ env: { NODE_ENV: "development" } }).sync).toBe(false)
    expect(resolveLoggerConfig({ env: { NODE_ENV: "production" } }).sync).toBe(false)
    expect(resolveLoggerConfig({ sync: false, env: { NODE_ENV: "test" } }).sync).toBe(false)
    expect(resolveLoggerConfig({ sync: true, env: { NODE_ENV: "production" } }).sync).toBe(true)
  })

  it("emits valid NDJSON envelope in development and test when LOG_FORMAT=json", () => {
    for (const nodeEnv of ["development", "test"]) {
      const { destination, lines } = createCaptureStream()
      const logger = createLogger({
        app: "Worker",
        module: "Sync",
        context: "Runner",
        env: { NODE_ENV: nodeEnv, LOG_FORMAT: "json" },
        sync: true,
        destination,
      })

      logger.info("batch processed", { count: 12 })

      expect(lines).toHaveLength(1)
      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>
      expect(parsed.level).toBe("info")
      expect(parsed.message).toBe("batch processed")
      expect(parsed.app).toBe("Worker")
      expect(parsed.module).toBe("Sync")
      expect(parsed.context).toBe("Runner")
      expect(parsed.count).toBe(12)
      expect(typeof parsed.time).toBe("string")
      expect(Number.isNaN(Date.parse(parsed.time as string))).toBe(false)
    }
  })

  it("formats pretty output with [app::module::context] prefix and ignores internal metadata keys", () => {
    const { destination, lines } = createCaptureStream()
    const logger = createLogger({
      app: "Api",
      module: "Auth",
      context: "Login",
      bindings: { reqId: "req-hidden-in-pretty" },
      format: "pretty",
      sync: true,
      destination,
    })

    logger.info("signed in", { userId: "u-1" })

    const output = lines.join("")
    expect(output).toContain("[Api::Auth::Login] signed in")
    expect(output).toContain("userId")
    expect(output).not.toContain("req-hidden-in-pretty")
  })

  it("omits empty brackets in pretty mode when app, module, and context are unset", () => {
    const { destination, lines } = createCaptureStream()
    const logger = createLogger({
      format: "pretty",
      sync: true,
      destination,
    })

    logger.info("plain message")

    const output = lines.join("")
    expect(output).toContain("plain message")
    expect(output).not.toContain("[]")
  })
})
