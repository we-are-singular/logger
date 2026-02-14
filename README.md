# @we-are-singular/logger

[![npm version](https://badge.fury.io/js/%40we-are-singular%2Flogger.svg)](https://badge.fury.io/js/%40we-are-singular%2Flogger)

This package provides a shared ESLint configuration for Singular projects.

## Installation

```bash
npm install --save-dev @we-are-singular/logger
```

## Usage

```typescript
import { LoggerClass } from "@we-are-singular/logger"

const logger = new LoggerClass("MyApp", "Module", "Context")
logger.info("Hello, world!")
logger.error("Something went wrong!")
logger.withModule("AnotherModule").info("Hello, world!")
```

## NestJS

### Using NestJSLoggerClass (recommended)

override default logger:

```typescript
import { NestJSLoggerClass, LoggerFactory } from "@we-are-singular/logger"

// Using direct instantiation
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: new NestJSLoggerClass().withModule("AppModule").forRoot(),
})

// Using LoggerFactory
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: LoggerFactory.forNestJS("AppModule").forRoot(),
})
```

auto context from module provider:

```typescript
// use forFeature() In other modules
@Module({
  imports: [],
  controllers: [],
  providers: [
    //
    NestJSLoggerClass.forFeature("Services"),
  ],
  exports: [
    //
    NestJSLoggerClass,
  ],
})
export class ServicesModule {}
```

auto context:

```typescript
// as a base class, adding a logger to all classes with a context of the class name
@Injectable()
export abstract class BaseClass {
  readonly logger: NestJSLoggerClass
  constructor(
    //
    @Inject(NestJSLoggerClass) logger: NestJSLoggerClass
  ) {
    this.logger = logger.withContext(this.constructor.name.toString())
  }
}
```

### Using LoggerService (deprecated)

> **Note:** `LoggerService` is deprecated and will be removed in a future version. Please use `NestJSLoggerClass` instead.

override default logger:

```typescript
import { LoggerService } from "@we-are-singular/logger"

// use forRoot() In main.ts
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: new LoggerService().withModule("AppModule").forRoot(),
})
```

auto context from module provider:

```typescript
// use forFeature() In other modules
@Module({
  imports: [],
  controllers: [],
  providers: [
    //
    LoggerService.forFeature("Services"),
  ],
  exports: [
    //
    LoggerService,
  ],
})
export class ServicesModule {}
```

auto context:

```typescript
// as a base class, adding a logger to all classes with a context of the class name
@Injectable()
export abstract class BaseClass {
  readonly logger: LoggerService
  constructor(
    //
    @Inject(LoggerService) logger: LoggerService
  ) {
    this.logger = logger.withContext(this.constructor.name.toString())
  }
}
```

## Fastify

### Using FastifyLoggerClass

The FastifyLoggerClass implements the FastifyBaseLogger interface and can be used directly with Fastify:

```typescript
import fastify from "fastify"
import { FastifyLoggerClass, LoggerFactory } from "@we-are-singular/logger"

// Using direct instantiation
const app = fastify({
  logger: new FastifyLoggerClass("api"),
})

// Using LoggerFactory
const app = fastify({
  logger: LoggerFactory.forFastify("api"),
})
```

This replaces the need for custom logger creation like:

```typescript
// Old way (no longer needed)
function createFastifyLogger(): FastifyBaseLogger {
  const apiLogger = logger.fork().setModule("api")

  return {
    level: "info",
    info: apiLogger.info.bind(apiLogger),
    error: apiLogger.error.bind(apiLogger),
    debug: apiLogger.debug.bind(apiLogger),
    fatal: apiLogger.fatal.bind(apiLogger),
    warn: apiLogger.warn.bind(apiLogger),
    trace: apiLogger.trace.bind(apiLogger),
    silent: apiLogger.silent?.bind(apiLogger) || (() => {}),
    child: () => createFastifyLogger(),
  }
}
```
