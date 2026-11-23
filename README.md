# @we-are-singular/logger

Fast, immutable, side-effect-free Pino v10 logger wrapper for Node.js, NestJS, and Fastify. Ships with opinionated credential redaction defaults, deterministic environment configuration, built-in `pino-pretty` formatting loaded lazily in dev, subpath framework adapters, and synchronous test helpers.

## Installation

Requires Node.js `>= 22`.

```bash
npm install @we-are-singular/logger
```

## Quick Start

Create one root logger at application startup and derive immutable children per module, component, or request. Every `withModule`, `withContext`, `withBindings`, `child`, and `fork` call returns a new `LoggerClass` backed by `pino.child()` without mutating its parent.

```ts
import { createLogger } from "@we-are-singular/logger"

const rootLogger = createLogger({ app: "BillingApi" })
const invoicesLogger = rootLogger.withModule("Invoices").withContext("InvoiceService")
const reqLogger = invoicesLogger.withBindings({ requestId: "req-123", workspaceId: "ws-42" })

reqLogger.info("Invoice created", { invoiceId: "inv-9", totalCents: 4900 })

// Lazy payloads run only when the level is enabled (zero overhead when LOG_LEVEL=info).
reqLogger.trace("Detailed invoice snapshot", () => ({
  lineItemCount: computeLineItemCount(),
}))

if (reqLogger.isLevelEnabled("debug")) {
  reqLogger.debug("Debug diagnostics ready")
}

// Drain buffered logs before process exit.
rootLogger.flush()
```

## Configuration & Environment Precedence

Options passed to `createLogger(options)` always take precedence over environment variables. Pass `env` to override `process.env` in deterministic tests.

| Setting     | Precedence                                                                                                                      | Default                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `format`    | `options.format` > `LOG_FORMAT` (`json` \| `pretty`) > `LOG_HUMAN` (`1`/`true` => `pretty`, `0`/`false` => `json`) > `NODE_ENV` | `"json"` in `production`, `"pretty"` otherwise |
| `level`     | `options.level` > valid `LOG_LEVEL` > `NODE_ENV` (invalid strings fall back cleanly)                                            | `"info"` in `production`, `"debug"` otherwise  |
| `sync`      | `options.sync` > `NODE_ENV === "test"`                                                                                          | `true` in `test`, `false` otherwise            |
| `errorMode` | `options.errorMode` (`"full"` \| `"safe"`)                                                                                      | `"full"`                                       |

- **JSON envelope:** Emits ISO-8601 `time`, string `level` labels (`"info"`, `"error"`, etc.), `messageKey: "message"`, and non-empty `app`, `module`, `context`, and custom bindings.
- **Pretty mode:** Formats `[app::module::context] message` and hides `pid`, `hostname`, `app`, `module`, `context`, and `reqId`. Loads `pino-pretty` lazily only when pretty mode is active so production JSON mode pays zero startup overhead.

## Security, Redaction & Safe Errors

`createLogger` enables `fast-redact` by default using `DEFAULT_REDACT_PATHS` with censor `"[REDACTED]"`. Default paths redact top-level and 1-level nested credential fields (`password`, `passphrase`, `token`, `accessToken`, `refreshToken`, `idToken`, `secret`, `clientSecret`, `webhookSecret`, `apiKey`, `privateKey`, `authorization`, `cookie`, `set-cookie`, `creditCard`, `ssn`) plus HTTP headers (`headers.authorization`, `headers.cookie`, `headers["set-cookie"]`, `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`).

```ts
import { DEFAULT_REDACT_PATHS, createLogger, safeError } from "@we-are-singular/logger"

// Extend default redaction paths.
const logger = createLogger({
  app: "Payments",
  redact: [...DEFAULT_REDACT_PATHS, "billing.iban"],
})

// Disable redaction explicitly when needed.
const rawLogger = createLogger({ redact: false })

// Opt-in safe error serialization (strips Error.message and stack traces).
const strictLogger = createLogger({ app: "Auth", errorMode: "safe" })

// Or sanitize individual errors explicitly in default ("full") mode.
logger.error("Database connection failed", { err: safeError(error) })
```

## Async Correlation Context (Opt-In)

Use `createLogContext` to attach per-request or per-job fields automatically via Node's `AsyncLocalStorage` with zero overhead when unused.

```ts
import { createLogContext, createLogger } from "@we-are-singular/logger"

const logContext = createLogContext<{ requestId: string; tenantId?: string }>()
const logger = createLogger({ app: "Api", mixin: logContext.mixin })

await logContext.run({ requestId: "req-1", tenantId: "tenant-9" }, async () => {
  logger.info("Handling request")
})
```

## Testing Helpers

```ts
import { createMemoryLogger, createNoopLogger } from "@we-are-singular/logger"

// Synchronous in-memory capture for assertions.
const { logger, records, clear } = createMemoryLogger({ app: "TestApp", level: "debug" })
logger.withModule("Users").info("Created user", { id: "u-1" })
// records[0] === { level: "info", app: "TestApp", module: "Users", id: "u-1", message: "Created user", ... }
clear()

// Silent no-op logger (no I/O, never loads pino-pretty, skips lazy thunks).
const silentLogger = createNoopLogger()
```

## Framework Adapters

Framework adapters are exported from dedicated subpaths so applications that do not use NestJS or Fastify never load framework code.

### NestJS (`@we-are-singular/logger/nestjs`)

```ts
import { Inject, Injectable, Module } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { createLogger } from "@we-are-singular/logger"
import { NestJSLoggerAdapter, createNestJSLogger } from "@we-are-singular/logger/nestjs"

const rootLogger = createLogger({ app: "MyNestApp" })

const app = await NestFactory.create(AppModule, {
  logger: createNestJSLogger(rootLogger.withModule("Bootstrap")).forRoot(),
})

@Module({
  providers: [NestJSLoggerAdapter.forRootProvider(rootLogger), NestJSLoggerAdapter.forFeature("Services")],
  exports: [NestJSLoggerAdapter],
})
export class ServicesModule {}

@Injectable()
export class UsersService {
  private readonly logger: NestJSLoggerAdapter

  constructor(@Inject(NestJSLoggerAdapter) logger: NestJSLoggerAdapter) {
    this.logger = logger.withContext(UsersService.name)
  }
}
```

### Fastify (`@we-are-singular/logger/fastify`)

Pass the adapter to Fastify v5's `loggerInstance` option. `child()` chains directly from the underlying Pino logger without creating extra root streams.

```ts
import fastify from "fastify"
import { createLogger } from "@we-are-singular/logger"
import { createFastifyLogger } from "@we-are-singular/logger/fastify"

const rootLogger = createLogger({ app: "Gateway" })

const app = fastify({
  loggerInstance: createFastifyLogger(rootLogger.withModule("Http")),
})
```

## Migrating from v2 to v3

| v2 API / Behavior                                             | v3 Replacement                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Import-time singleton `getLogger()`                           | Create explicitly with `createLogger(options)` and pass or derive children |
| `logger.setModule("X")` / `logger.setContext("Y")` (mutating) | `logger.withModule("X")` / `logger.withContext("Y")` (immutable)           |
| `LoggerService` / `NestJSLoggerClass`                         | `NestJSLoggerAdapter` from `@we-are-singular/logger/nestjs`                |
| `FastifyLoggerClass`                                          | `FastifyLoggerAdapter` from `@we-are-singular/logger/fastify`              |
| `LoggerFactory.forNestJS(...)`                                | `createNestJSLogger(...)` from `@we-are-singular/logger/nestjs`            |
| `LoggerFactory.forFastify(...)`                               | `createFastifyLogger(...)` from `@we-are-singular/logger/fastify`          |
| `fastify({ logger: ... })`                                    | `fastify({ loggerInstance: createFastifyLogger(...) })` (Fastify v5)       |
| `NestJSLoggerClass.forRoot().error(msg)` logged `"undefined"` | Logs `msg` cleanly and includes `stack` only when defined                  |
| Placeholder redaction (`user.password`, `options.token`)      | Full `DEFAULT_REDACT_PATHS`; override or pass `redact: false` if needed    |

## Development

Requires Node.js from [`.nvmrc`](.nvmrc) (supports Node `>= 22`).

```bash
npm ci
npm run format:check
npm run lint
npm run build
npm run test
npm run test:coverage
npm run check:pkg
```

### Structure

```text
src/
  index.ts                      # Root entrypoint (@we-are-singular/logger)
  core/
    types.ts                    # Public TypeScript contracts
    config.ts                   # Env/option resolution, redaction defaults, safeError()
    pretty.ts                   # Lazy pino-pretty stream loader
    pino-factory.ts             # Root Pino instance construction
    logger.class.ts             # Immutable LoggerClass and createLogger()
    log-context.ts              # Opt-in AsyncLocalStorage correlation helper
    test-loggers.ts             # createNoopLogger() and createMemoryLogger()
  adapters/
    nestjs.adapter.ts           # NestJS adapter (@we-are-singular/logger/nestjs)
    fastify.adapter.ts          # Fastify adapter (@we-are-singular/logger/fastify)
test/
  core/                         # Core unit & behavior tests
  adapters/                     # NestJS & Fastify adapter tests
  smoke/                        # Built ESM/CJS package smoke tests
```

## License

MIT
