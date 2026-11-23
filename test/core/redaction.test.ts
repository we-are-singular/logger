import { DEFAULT_REDACT_CENSOR, DEFAULT_REDACT_PATHS, createMemoryLogger } from "../../src/index"

describe("security and redaction", () => {
  it("redacts top-level sensitive keys, 1-level nested credentials, and HTTP headers by default", () => {
    const { logger, records } = createMemoryLogger({ level: "info" })

    logger.info("sensitive payload", {
      password: "plain-password",
      token: "plain-token",
      apiKey: "plain-api-key",
      "set-cookie": "session=abc",
      user: {
        password: "nested-password",
        passphrase: "nested-passphrase",
        ssn: "123-45-6789",
        creditCard: "4111-1111",
        safeName: "Alice",
      },
      auth: {
        token: "nested-token",
        accessToken: "nested-access",
        refreshToken: "nested-refresh",
        idToken: "nested-id",
        secret: "nested-secret",
        clientSecret: "nested-client-secret",
        webhookSecret: "nested-webhook-secret",
        privateKey: "nested-private-key",
        authorization: "Bearer nested",
        cookie: "sid=nested",
        "set-cookie": "sid=nested-set",
      },
      headers: {
        authorization: "Bearer top-header",
        cookie: "sid=top-header",
        "set-cookie": "sid=top-set-cookie",
        "x-request-id": "keep-me",
      },
      req: {
        headers: {
          authorization: "Bearer req-header",
          cookie: "sid=req-cookie",
          host: "api.example.com",
        },
      },
      res: {
        headers: {
          "set-cookie": "sid=res-set-cookie",
          "content-type": "application/json",
        },
      },
    })

    expect(records).toHaveLength(1)
    const entry = records[0]!

    expect(entry.password).toBe(DEFAULT_REDACT_CENSOR)
    expect(entry.token).toBe(DEFAULT_REDACT_CENSOR)
    expect(entry.apiKey).toBe(DEFAULT_REDACT_CENSOR)
    expect(entry["set-cookie"]).toBe(DEFAULT_REDACT_CENSOR)

    expect(entry.user).toEqual({
      password: "[REDACTED]",
      passphrase: "[REDACTED]",
      ssn: "[REDACTED]",
      creditCard: "[REDACTED]",
      safeName: "Alice",
    })

    expect(entry.auth).toEqual({
      token: "[REDACTED]",
      accessToken: "[REDACTED]",
      refreshToken: "[REDACTED]",
      idToken: "[REDACTED]",
      secret: "[REDACTED]",
      clientSecret: "[REDACTED]",
      webhookSecret: "[REDACTED]",
      privateKey: "[REDACTED]",
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      "set-cookie": "[REDACTED]",
    })

    expect(entry.headers).toEqual({
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      "set-cookie": "[REDACTED]",
      "x-request-id": "keep-me",
    })

    expect(entry.req).toEqual({
      headers: {
        authorization: "[REDACTED]",
        cookie: "[REDACTED]",
        host: "api.example.com",
      },
    })

    expect(entry.res).toEqual({
      headers: {
        "set-cookie": "[REDACTED]",
        "content-type": "application/json",
      },
    })
  })

  it("supports extending DEFAULT_REDACT_PATHS with custom paths", () => {
    const { logger, records } = createMemoryLogger({
      redact: [...DEFAULT_REDACT_PATHS, "customSecret", "billing.iban"],
    })

    logger.info("extended redaction", {
      password: "secret-password",
      customSecret: "top-secret",
      billing: { iban: "DE89370400440532013000", currency: "EUR" },
    })

    expect(records[0]).toMatchObject({
      password: "[REDACTED]",
      customSecret: "[REDACTED]",
      billing: { iban: "[REDACTED]", currency: "EUR" },
    })
  })

  it("supports custom censor and remove modes", () => {
    const censored = createMemoryLogger({
      redact: { paths: ["secret"], censor: "***" },
    })
    censored.logger.info("custom censor", { secret: "abc", ok: true })
    expect(censored.records[0]).toMatchObject({ secret: "***", ok: true })

    const removed = createMemoryLogger({
      redact: { paths: ["secret"], remove: true },
    })
    removed.logger.info("removed key", { secret: "abc", ok: true })
    expect(removed.records[0]).not.toHaveProperty("secret")
    expect(removed.records[0]).toMatchObject({ ok: true })
  })

  it("allows disabling redaction explicitly with redact: false", () => {
    const { logger, records } = createMemoryLogger({ redact: false })

    logger.info("unredacted", { password: "visible-in-local-debug" })

    expect(records[0]?.password).toBe("visible-in-local-debug")
  })
})
