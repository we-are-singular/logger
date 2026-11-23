import pino, { type DestinationStream } from "pino"
import { LoggerClass, createLogger, createMemoryLogger } from "../../src/index"

describe("LoggerClass immutability and bindings", () => {
  it("never mutates parent logger across withModule, withContext, withBindings, child, and fork", () => {
    const { logger: root, records } = createMemoryLogger({
      app: "BillingApp",
      module: "Core",
      context: "Bootstrap",
      bindings: { env: "test", region: "eu-west-1" },
      level: "trace",
    })

    const modChild = root.withModule("Invoices")
    const ctxChild = modChild.withContext("InvoiceService")
    const boundChild = ctxChild.withBindings({ requestId: "req-1", workspaceId: "ws-9" })
    const nestedChild = boundChild.child({ jobId: "job-77" })
    const forkedChild = nestedChild.fork().withContext("PdfRenderer")

    root.info("root event")
    modChild.info("module event")
    ctxChild.info("context event")
    boundChild.info("bound event")
    nestedChild.info("nested event")
    forkedChild.info("forked event")

    expect(records).toHaveLength(6)

    expect(records[0]).toMatchObject({
      app: "BillingApp",
      module: "Core",
      context: "Bootstrap",
      env: "test",
      region: "eu-west-1",
      message: "root event",
    })
    expect(records[0]).not.toHaveProperty("requestId")

    expect(records[1]).toMatchObject({
      app: "BillingApp",
      module: "Invoices",
      context: "Bootstrap",
      env: "test",
      region: "eu-west-1",
      message: "module event",
    })

    expect(records[2]).toMatchObject({
      app: "BillingApp",
      module: "Invoices",
      context: "InvoiceService",
      env: "test",
      region: "eu-west-1",
      message: "context event",
    })

    expect(records[3]).toMatchObject({
      app: "BillingApp",
      module: "Invoices",
      context: "InvoiceService",
      requestId: "req-1",
      workspaceId: "ws-9",
      message: "bound event",
    })
    expect(records[3]).not.toHaveProperty("jobId")

    expect(records[4]).toMatchObject({
      app: "BillingApp",
      module: "Invoices",
      context: "InvoiceService",
      requestId: "req-1",
      workspaceId: "ws-9",
      jobId: "job-77",
      message: "nested event",
    })

    expect(records[5]).toMatchObject({
      app: "BillingApp",
      module: "Invoices",
      context: "PdfRenderer",
      requestId: "req-1",
      workspaceId: "ws-9",
      jobId: "job-77",
      message: "forked event",
    })
  })

  it("avoids duplicate JSON keys even after empty or level-only childOptions and preserves level on { level: undefined }", () => {
    const rawLines: string[] = []
    const destination: DestinationStream = {
      write(chunk: string) {
        rawLines.push(chunk)
      },
    }

    const root = createLogger({
      app: "MyApp",
      module: "OldModule",
      context: "OldContext",
      bindings: { requestId: "req-1" },
      level: "info",
      format: "json",
      sync: true,
      destination,
    })

    const emptyOptsChild = root.child({ traceId: "t-1" }, {})
    const debugChild = emptyOptsChild.child({ spanId: "s-1" }, { level: "debug" })
    const overridden = debugChild
      .child({ module: "NewModule" }, { level: undefined })
      .withContext("NewContext")
      .withBindings({ requestId: "req-2" })

    expect(overridden.level).toBe("debug")
    overridden.debug("overridden")

    expect(rawLines).toHaveLength(1)
    const line = rawLines[0]!
    expect(line.match(/"module":/g)).toHaveLength(1)
    expect(line.match(/"context":/g)).toHaveLength(1)
    expect(line.match(/"requestId":/g)).toHaveLength(1)

    const parsed = JSON.parse(line) as Record<string, unknown>
    expect(parsed).toMatchObject({
      level: "debug",
      app: "MyApp",
      module: "NewModule",
      context: "NewContext",
      requestId: "req-2",
      traceId: "t-1",
      spanId: "s-1",
      message: "overridden",
    })
  })

  it("preserves safe error serializers when childOptions supplies pino.stdSerializers.err", () => {
    const { logger, records } = createMemoryLogger({ errorMode: "safe" })
    const child = logger.child({ reqId: "r-1" }, { serializers: { err: pino.stdSerializers.err } })

    child.error("failed", { err: Object.assign(new Error("postgres://secret@db/prod"), { code: "ECONNREFUSED" }) })

    expect(records).toHaveLength(1)
    expect(records[0]?.err).toEqual({ type: "Error", code: "ECONNREFUSED" })
    expect(JSON.stringify(records[0])).not.toContain("postgres://secret@db/prod")
  })

  it("supports both positional and LoggerOptions constructor forms", () => {
    const lines: string[] = []
    const destination: DestinationStream = {
      write(chunk: string) {
        lines.push(chunk)
      },
    }

    const positional = new LoggerClass("DirectApp", "Orders", "CreateOrder", {
      format: "json",
      sync: true,
      level: "debug",
      destination,
    })
    const fromOptions = new LoggerClass({
      app: "OptionsApp",
      module: "Billing",
      format: "json",
      sync: true,
      level: "info",
      destination,
    })

    positional.debug("created", { orderId: "ord-123" })
    fromOptions.info("charged")

    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: "debug",
      app: "DirectApp",
      module: "Orders",
      context: "CreateOrder",
      orderId: "ord-123",
      message: "created",
    })
    expect(JSON.parse(lines[1]!)).toMatchObject({
      level: "info",
      app: "OptionsApp",
      module: "Billing",
      message: "charged",
    })
  })

  it("does not expose removed v2 mutating methods", () => {
    const { logger } = createMemoryLogger()
    expect("setModule" in logger).toBe(false)
    expect("setContext" in logger).toBe(false)
  })
})
