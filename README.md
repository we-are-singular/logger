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
