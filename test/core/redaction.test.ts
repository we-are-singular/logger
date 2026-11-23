import { DEFAULT_REDACT_CENSOR, DEFAULT_REDACT_PATHS, createMemoryLogger } from "../../src/index"

describe("security and redaction", () => {
  it("redacts top-level, nested camelCase/snake_case credentials, and lowercase/Title-Case HTTP headers by default", () => {
    const { logger, records } = createMemoryLogger({ level: "info" })

    logger.info("sensitive payload", {
      password: "plain-password",
      token: "plain-token",
      apiKey: "plain-api-key",
      api_key: "snake-api-key",
      "set-cookie": "session=abc",
      "x-api-key": "top-x-api-key",
      user: {
        password: "nested-password",
        passphrase: "nested-passphrase",
        ssn: "123-45-6789",
        creditCard: "4111-1111",
        credit_card: "4222-2222",
        safeName: "Alice",
      },
      auth: {
        token: "nested-token",
        accessToken: "nested-access",
        access_token: "snake-access",
        refreshToken: "nested-refresh",
        refresh_token: "snake-refresh",
        idToken: "nested-id",
        id_token: "snake-id",
        secret: "nested-secret",
        clientSecret: "nested-client-secret",
        client_secret: "snake-client-secret",
        webhookSecret: "nested-webhook-secret",
        webhook_secret: "snake-webhook-secret",
        privateKey: "nested-private-key",
        private_key: "snake-private-key",
        authorization: "Bearer nested",
        cookie: "sid=nested",
        "set-cookie": "sid=nested-set",
      },
      headers: {
        authorization: "Bearer top-header",
        Authorization: "Bearer title-header",
        cookie: "sid=top-header",
        Cookie: "sid=title-header",
        "set-cookie": "sid=top-set-cookie",
        "Set-Cookie": "sid=title-set-cookie",
        "x-api-key": "header-api-key",
        "X-Api-Key": "title-api-key",
        "x-request-id": "keep-me",
      },
      req: {
        headers: {
          authorization: "Bearer req-header",
          Authorization: "Bearer req-title",
          cookie: "sid=req-cookie",
          Cookie: "sid=req-title-cookie",
          "x-api-key": "req-api-key",
          host: "api.example.com",
        },
      },
      res: {
        headers: {
          "set-cookie": "sid=res-set-cookie",
          "Set-Cookie": "sid=res-title-set-cookie",
          "content-type": "application/json",
        },
      },
    })

    expect(records).toHaveLength(1)
    const entry = records[0]!

    expect(entry.password).toBe(DEFAULT_REDACT_CENSOR)
    expect(entry.token).toBe(DEFAULT_REDACT_CENSOR)
    expect(entry.apiKey).toBe(DEFAULT_REDACT_CENSOR)
    expect(entry.api_key).toBe(DEFAULT_REDACT_CENSOR)
    expect(entry["set-cookie"]).toBe(DEFAULT_REDACT_CENSOR)
    expect(entry["x-api-key"]).toBe(DEFAULT_REDACT_CENSOR)

    expect(entry.user).toEqual({
      password: "[REDACTED]",
      passphrase: "[REDACTED]",
      ssn: "[REDACTED]",
      creditCard: "[REDACTED]",
      credit_card: "[REDACTED]",
      safeName: "Alice",
    })

    expect(entry.auth).toEqual({
      token: "[REDACTED]",
      accessToken: "[REDACTED]",
      access_token: "[REDACTED]",
      refreshToken: "[REDACTED]",
      refresh_token: "[REDACTED]",
      idToken: "[REDACTED]",
      id_token: "[REDACTED]",
      secret: "[REDACTED]",
      clientSecret: "[REDACTED]",
      client_secret: "[REDACTED]",
      webhookSecret: "[REDACTED]",
      webhook_secret: "[REDACTED]",
      privateKey: "[REDACTED]",
      private_key: "[REDACTED]",
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      "set-cookie": "[REDACTED]",
    })

    expect(entry.headers).toEqual({
      authorization: "[REDACTED]",
      Authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      Cookie: "[REDACTED]",
      "set-cookie": "[REDACTED]",
      "Set-Cookie": "[REDACTED]",
      "x-api-key": "[REDACTED]",
      "X-Api-Key": "[REDACTED]",
      "x-request-id": "keep-me",
    })

    expect(entry.req).toEqual({
      headers: {
        authorization: "[REDACTED]",
        Authorization: "[REDACTED]",
        cookie: "[REDACTED]",
        Cookie: "[REDACTED]",
        "x-api-key": "[REDACTED]",
        host: "api.example.com",
      },
    })

    expect(entry.res).toEqual({
      headers: {
        "set-cookie": "[REDACTED]",
        "Set-Cookie": "[REDACTED]",
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
