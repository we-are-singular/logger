import { setPrettyLoaderForTesting } from "../../src/core/pretty"
import { createLogger } from "../../src/index"

describe("pino-pretty loader fallback", () => {
  afterEach(() => {
    setPrettyLoaderForTesting(undefined)
  })

  it("falls back cleanly to valid NDJSON when pino-pretty fails to load", () => {
    setPrettyLoaderForTesting(() => undefined)

    const lines: string[] = []
    const logger = createLogger({
      app: "SlimContainer",
      module: "Http",
      format: "pretty",
      sync: true,
      destination: {
        write(chunk: string) {
          lines.push(chunk)
        },
      },
    })

    logger.info("fallback works", { ok: true })

    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>
    expect(parsed).toMatchObject({
      level: "info",
      app: "SlimContainer",
      module: "Http",
      message: "fallback works",
      ok: true,
    })
  })
})
