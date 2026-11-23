import type { DestinationStream } from "pino"
import { createLogger, type LoggerClass } from "./logger.class"
import type { LoggerOptions, MemoryLogger } from "./types"

const noopDestination: DestinationStream = {
  write(): void {
    // Discard all log records.
  },
}

/**
 * Create a silent no-op logger that performs no I/O and never loads `pino-pretty`.
 */
export function createNoopLogger(): LoggerClass {
  return createLogger({
    level: "silent",
    format: "json",
    destination: noopDestination,
    redact: false,
  })
}

/**
 * Create a synchronous, in-memory JSON logger for deterministic tests.
 */
export function createMemoryLogger(
  options: Omit<LoggerOptions, "format" | "destination" | "sync"> = {}
): MemoryLogger<LoggerClass> {
  const records: Record<string, unknown>[] = []

  const destination: DestinationStream = {
    write(chunk: string): void {
      const trimmed = chunk.trim()
      if (!trimmed) {
        return
      }
      for (const line of trimmed.split("\n")) {
        if (line.length > 0) {
          records.push(JSON.parse(line) as Record<string, unknown>)
        }
      }
    },
  }

  const logger = createLogger({
    ...options,
    format: "json",
    sync: true,
    destination,
  })

  return {
    logger,
    records,
    clear(): void {
      records.length = 0
    },
  }
}
