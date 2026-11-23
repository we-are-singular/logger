# @we-are-singular/logger

Fast, immutable, side-effect-free Pino v10 logger wrapper for Node.js, NestJS, and Fastify. Ships with credential redaction defaults, deterministic environment configuration, built-in `pino-pretty` formatting loaded lazily in dev, subpath framework adapters, `AsyncLocalStorage` correlation helpers, and synchronous test utilities.

## Installation

Requires Node.js `>= 22`. Both ESM (`import`) and CommonJS (`require`) are supported.

```bash
npm install @we-are-singular/logger
```

Framework adapters are exposed on dedicated subpaths with optional peer dependencies (`@nestjs/common` `^10 || ^11 || ^12`, `fastify` `^5`), so apps that do not use NestJS or Fastify never install or load framework code.

## Quick Start

Create **one** root logger per process at startup and derive immutable child loggers per module, component, or request. Every `withModule`, `withContext`, `withBindings`, `child`, and `fork` call returns a new `LoggerClass` backed by `pino.child()`, sharing the single underlying output stream without mutating its parent.

```ts
import { createLogger } from "@we-are-singular/logger"

const rootLogger = createLogger({ app: "BillingApi" })
const invoicesLogger = rootLogger.withModule("Invoices").withContext("InvoiceService")
const reqLogger = invoicesLogger.withBindings({ requestId: "req-123", workspaceId: "ws-42" })

reqLogger.info("Invoice created", { invoiceId: "inv-9", totalCents: 4900 })

// Lazy payloads run only when the target level is enabled (zero allocation when LOG_LEVEL=info).
reqLogger.trace("Detailed invoice snapshot", () => ({
  lineItemCount: computeLineItemCount(),
}))

if (reqLogger.isLevelEnabled("debug")) {
  reqLogger.debug("Debug diagnostics ready")
}

// Drain buffered logs before process exit.
await new Promise<void>(resolve => rootLogger.flush(() => resolve()))
```

## Core API (`@we-are-singular/logger`)

### Factory & Constructor

- `createLogger(options?: LoggerOptions): LoggerClass` — Recommended entrypoint.
- `new LoggerClass(options?: LoggerOptions)` or `new LoggerClass(app?, module?, context?, options?)` — Equivalent class constructor.

### `LoggerOptions`

| Option        | Type                                                                          | Default                                         | Notes                                                                                               |
| ------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `app`         | `string`                                                                      | —                                               | Application label in bindings and `[app::module::context]` pretty prefix                            |
| `module`      | `string`                                                                      | —                                               | Module/domain label                                                                                 |
| `context`     | `string`                                                                      | —                                               | Class/component label                                                                               |
| `bindings`    | `Record<string, unknown>`                                                     | —                                               | Additional static key-value bindings merged onto every record                                       |
| `level`       | `"trace" \| "debug" \| "info" \| "warn" \| "error" \| "fatal" \| "silent"`    | `LOG_LEVEL` or env default                      | Overrides `LOG_LEVEL`                                                                               |
| `format`      | `"json" \| "pretty"`                                                          | `LOG_FORMAT` / `LOG_HUMAN` / env default        | Overrides env vars                                                                                  |
| `sync`        | `boolean`                                                                     | `true` when `NODE_ENV === "test"`, else `false` | Synchronous stdout writes                                                                           |
| `destination` | `DestinationStream`                                                           | stdout                                          | Custom Pino stream (files, stderr, memory buffers)                                                  |
| `redact`      | `false \| string[] \| { paths: string[]; censor?: string; remove?: boolean }` | `DEFAULT_REDACT_PATHS`                          | Passing an array or object **replaces** defaults; spread `[...DEFAULT_REDACT_PATHS, ...]` to extend |
| `mixin`       | `() => Record<string, unknown>`                                               | —                                               | Dynamic per-log fields (e.g. `createLogContext().mixin`)                                            |
| `errorMode`   | `"full" \| "safe"`                                                            | `"full"`                                        | `"safe"` logs only `{ type, code }` and strips messages/stacks                                      |
| `env`         | `Record<string, string \| undefined>`                                         | `process.env`                                   | Deterministic env map override for tests                                                            |

### `LoggerClass` Methods & Properties

- **Logging:** `trace`, `debug`, `info`, `warn`, `error`, `fatal` — signature `(message: string, data?: LogData | (() => LogData)) => void`. Non-object runtime payloads (primitives, arrays, `Date`, `Map`, etc.) are safely wrapped as `{ value }`.
- **Immutable derivation:** `withModule(module)`, `withContext(context)`, `withBindings(bindings)`, `child(bindings, childOptions?)`, `fork()`. Overriding an existing binding key (e.g. calling `withModule("B")` on a logger with `module: "A"`) rebuilds cleanly without duplicate keys in raw NDJSON.
- **Guards & lifecycle:** `isLevelEnabled(level)`, `flush(cb?)`, `readonly level`, `readonly errorMode`, `readonly pino`.

## Configuration & Environment Precedence

Options passed to `createLogger(options)` always take precedence over environment variables.

| Setting     | Precedence                                                                                                                      | Default                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `format`    | `options.format` > `LOG_FORMAT` (`json` \| `pretty`) > `LOG_HUMAN` (`1`/`true` => `pretty`, `0`/`false` => `json`) > `NODE_ENV` | `"json"` in `production`, `"pretty"` otherwise |
| `level`     | `options.level` > valid `LOG_LEVEL` > `NODE_ENV` (invalid strings fall back cleanly)                                            | `"info"` in `production`, `"debug"` otherwise  |
| `sync`      | `options.sync` > `NODE_ENV === "test"`                                                                                          | `true` in `test`, `false` otherwise            |
| `errorMode` | `options.errorMode` (`"full"` \| `"safe"`)                                                                                      | `"full"`                                       |

### Output Formats

**JSON mode (production default or `LOG_FORMAT=json`):** Emits NDJSON with ISO-8601 `time`, string `level` labels (`"info"`, `"error"`, etc.), `messageKey: "message"`, and non-empty `app`, `module`, `context`, and custom bindings. `pino-pretty` is never loaded in JSON mode.

```json
{
  "level": "info",
  "time": "2026-11-23T03:56:22.120Z",
  "pid": 1234,
  "hostname": "app-01",
  "app": "BillingApi",
  "module": "Invoices",
  "context": "InvoiceService",
  "requestId": "req-123",
  "invoiceId": "inv-9",
  "message": "Invoice created"
}
```

**Pretty mode (non-production default or `LOG_FORMAT=pretty` / `LOG_HUMAN=1`):** Formats `[app::module::context] message` and hides `pid`, `hostname`, `app`, `module`, `context`, and `reqId`. Loads `pino-pretty` lazily on demand.

```text
[03:56:22.320] INFO: [BillingApi::Invoices::InvoiceService] Invoice created
    requestId: "req-123"
    invoiceId: "inv-9"
```

## Security, Redaction & Safe Errors

`createLogger` enables `fast-redact` by default using `DEFAULT_REDACT_PATHS` with censor `"[REDACTED]"`. Default paths redact:

- Top-level and 1-level nested camelCase and snake_case credential fields: `password`, `passphrase`, `token`, `accessToken`/`access_token`, `refreshToken`/`refresh_token`, `idToken`/`id_token`, `secret`, `clientSecret`/`client_secret`, `webhookSecret`/`webhook_secret`, `apiKey`/`api_key`, `privateKey`/`private_key`, `creditCard`/`credit_card`, `ssn`.
- Top-level and 1-level nested lowercase and Title-Case HTTP headers (which covers `headers.*`): `authorization`/`Authorization`, `cookie`/`Cookie`, `set-cookie`/`Set-Cookie`, `x-api-key`/`X-Api-Key`, `proxy-authorization`/`Proxy-Authorization`.
- Nested HTTP request/response headers: `req.headers.*` and `res.headers["set-cookie"]`/`res.headers["Set-Cookie"]`.

> **Note:** Passing an array or object to `redact` **replaces** `DEFAULT_REDACT_PATHS`. Spread `DEFAULT_REDACT_PATHS` whenever you want to extend defaults.

```ts
import { DEFAULT_REDACT_PATHS, createLogger, safeError } from "@we-are-singular/logger"

// Extend default redaction paths.
const logger = createLogger({
  app: "Payments",
  redact: [...DEFAULT_REDACT_PATHS, "billing.iban"],
})

// Remove redacted keys entirely instead of replacing with "[REDACTED]".
const strippedLogger = createLogger({
  redact: { paths: [...DEFAULT_REDACT_PATHS], remove: true },
})

// Disable redaction explicitly when needed.
const rawLogger = createLogger({ redact: false })

// Opt-in safe error mode: recursively replaces Error instances in payloads, arrays, bindings,
// mixins, Fastify route errors, and NestJS forRoot() errors with { type, code } only.
const strictLogger = createLogger({ app: "Auth", errorMode: "safe" })

// Or sanitize individual errors explicitly in default ("full") mode.
logger.error("Database connection failed", { err: safeError(error) })
```

## Async Correlation Context (Opt-In)

Use `createLogContext` to attach per-request or per-job fields automatically via Node's `AsyncLocalStorage` with zero overhead when unused. Nested `run()` calls merge with outer fields and restore cleanly on exit; `mixin()` returns a fresh shallow copy on each log so per-log payloads never pollute the active context.

```ts
import { createLogContext, createLogger } from "@we-are-singular/logger"

const logContext = createLogContext<{ requestId: string; tenantId?: string; jobId?: string }>()
const logger = createLogger({ app: "Api", mixin: logContext.mixin })

await logContext.run({ requestId: "req-1", tenantId: "tenant-9" }, async () => {
  logger.info("Handling request") // includes requestId and tenantId

  await logContext.run({ jobId: "job-42" }, async () => {
    logger.info("Running nested job") // includes requestId, tenantId, and jobId
  })

  logger.info("Finished request") // includes requestId and tenantId only
})
```

## Testing Helpers

```ts
import { createMemoryLogger, createNoopLogger } from "@we-are-singular/logger"

// Synchronous in-memory JSON capture for deterministic unit/integration assertions.
const { logger, records, clear } = createMemoryLogger({ app: "TestApp", level: "debug" })
logger.withModule("Users").info("Created user", { id: "u-1" })
// records[0] => { level: "info", app: "TestApp", module: "Users", id: "u-1", message: "Created user", ... }
clear()

// Silent no-op logger (zero I/O, never loads pino-pretty, skips lazy thunks).
const silentLogger = createNoopLogger()
```

## Framework Adapters

### NestJS (`@we-are-singular/logger/nestjs`)

Exports: `NestJSLoggerAdapter`, `createNestJSLogger`, `NEST_ROOT_LOGGER`, and `type NestAdapterConstructor`.

- Register `NestJSLoggerAdapter.forRootProvider(rootLogger)` in a `@Global()` module imported by `AppModule` and export `NEST_ROOT_LOGGER` so every feature module's `forFeature()` shares the single root Pino stream.
- Pass `createNestJSLogger(rootLogger.withModule("Bootstrap")).forRoot()` to `NestFactory.create(..., { logger })` to capture NestJS bootstrap logs and standard `new Logger(Context)` calls (including structured extra objects, `Error` arguments, and static `Logger.error(msg, context)`).
- On `NestJSLoggerAdapter`, `.log()` maps to Pino `info` and `.verbose()` maps to Pino `trace` (matching NestJS `LoggerService` level names).
- `forFeature(module, CustomSubclass?, parent?)` and `withModule` / `withContext` / `withBindings` / `fork` preserve custom `NestJSLoggerAdapter` subclasses.

```ts
import { Global, Inject, Injectable, Logger, Module } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { createLogger } from "@we-are-singular/logger"
import { NEST_ROOT_LOGGER, NestJSLoggerAdapter, createNestJSLogger } from "@we-are-singular/logger/nestjs"

const rootLogger = createLogger({ app: "MyNestApp" })

@Global()
@Module({
  providers: [NestJSLoggerAdapter.forRootProvider(rootLogger)],
  exports: [NEST_ROOT_LOGGER],
})
export class LoggingModule {}

@Module({
  providers: [NestJSLoggerAdapter.forFeature("Services")],
  exports: [NestJSLoggerAdapter],
})
export class ServicesModule {}

@Module({
  imports: [LoggingModule, ServicesModule],
})
export class AppModule {}

@Injectable()
export class UsersService {
  private readonly logger: NestJSLoggerAdapter
  private readonly nestLogger = new Logger(UsersService.name)

  constructor(@Inject(NestJSLoggerAdapter) logger: NestJSLoggerAdapter) {
    this.logger = logger.withContext(UsersService.name)
  }

  createUser(id: string) {
    this.logger.info("Creating user", { id })
    this.logger.verbose("Trace payload", () => ({ id }))
    this.nestLogger.log("Also works with NestJS Logger", { id })
  }
}

const app = await NestFactory.create(AppModule, {
  logger: createNestJSLogger(rootLogger.withModule("Bootstrap")).forRoot(),
})
```

### Fastify (`@we-are-singular/logger/fastify`)

Exports: `FastifyLoggerAdapter` and `createFastifyLogger`.

- Pass `createFastifyLogger(...)` to Fastify v5's `loggerInstance` option.
- Injected `LoggerClass` instances are forked automatically so mutating `fastifyLogger.level` never mutates a shared parent logger, while per-request `req.log` / `child()` calls perform a single `pino.child()` allocation.
- Supports Pino-style `(obj, msg, ...args)`, printf `(msg, ...args)`, and ergonomic `(msg, obj)` overloads on both top-level and `child()` loggers.
- Preserves `errorMode: "safe"` across Fastify v5's internal `req`/`res`/`err` serializers and default HTTP 500 error handler without losing `req`/`res` metadata.

```ts
import fastify from "fastify"
import { createLogger } from "@we-are-singular/logger"
import { createFastifyLogger } from "@we-are-singular/logger/fastify"

const rootLogger = createLogger({ app: "Gateway" })

const app = fastify({
  loggerInstance: createFastifyLogger(rootLogger.withModule("Http")),
})

app.get("/health", async req => {
  const child = req.log.child({ feature: "health" })
  child.info("Health check", { ok: true })
  return { ok: true }
})
```

## Migrating from v2 to v3

| v2 API / Behavior                                             | v3 Replacement                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| No Node engine floor                                          | Requires Node.js `>= 22`                                                                          |
| Import-time singleton `getLogger()`                           | Create explicitly with `createLogger(options)` and pass or derive children                        |
| `logger.setModule("X")` / `logger.setContext("Y")` (mutating) | `logger.withModule("X")` / `logger.withContext("Y")` (immutable)                                  |
| `LoggerService` / `NestJSLoggerClass`                         | `NestJSLoggerAdapter` from `@we-are-singular/logger/nestjs`                                       |
| `FastifyLoggerClass`                                          | `FastifyLoggerAdapter` from `@we-are-singular/logger/fastify`                                     |
| `LoggerFactory.forNestJS("Mod")`                              | `createNestJSLogger({ module: "Mod" })` or `createNestJSLogger(rootLogger.withModule("Mod"))`     |
| `LoggerFactory.forFastify("App", "Mod")`                      | `createFastifyLogger({ app: "App", module: "Mod" })` or `createFastifyLogger(rootLogger)`         |
| `fastify({ logger: ... })`                                    | `fastify({ loggerInstance: createFastifyLogger(...) })` (Fastify v5)                              |
| Variadic `nestLogger.log(msg, ...extra)`                      | Structured single payload `nestLogger.log(msg, data?)` (`LogData \| () => LogData`)               |
| Core dev default `trace`; NestJS/Fastify default `info`       | Unified default level: `"debug"` outside `production`, `"info"` in `production`                   |
| `NestJSLoggerClass.forRoot().error(msg)` logged `"undefined"` | Logs `msg` cleanly and includes `stack` only when defined                                         |
| Placeholder redaction (`user.password`, `options.token`)      | Full `DEFAULT_REDACT_PATHS`; spread `[...DEFAULT_REDACT_PATHS, ...]` to extend or `redact: false` |

## Development & Releasing

Requires Node.js from [`.nvmrc`](.nvmrc) (supports Node `>= 22`).

```bash
npm ci
npm run format:check
npm run lint
npm run test
npm run test:coverage
npm run build
npm run test:smoke
npm run check:pkg
```

To cut and publish a release from `main` (runs formatting, lint, tests, build, smoke tests, and `publint` automatically via `release-it`):

```bash
npm run release
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
