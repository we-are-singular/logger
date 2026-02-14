import pino, { LoggerOptions, LogDescriptor, stdTimeFunctions, type Logger } from "pino"
import pretty from "pino-pretty"

const loggerOptions = {
  level: "trace",
  redact: ["user.password", "options.token"], // example of a redaction key
  timestamp: stdTimeFunctions.isoTime,
} satisfies LoggerOptions

const loggerFactory = (): Logger => {
  if (process.env.NODE_ENV !== "production" || parseInt(process.env.LOG_HUMAN ?? "") === 1) {
    return pino(
      loggerOptions,
      pretty({
        minimumLevel: (process.env.LOG_LEVEL as pino.Level) ?? "trace",
        sync: process.env.NODE_ENV === "test",
        colorize: true,
        colorizeObjects: true,
        singleLine: false,
        ignore: "pid,hostname,app,module,context,reqId",
        customPrettifiers: {
          //pid: (log) => "{log.pid}",
          //app: (name) => name,
        },
        messageFormat: (log: LogDescriptor) => {
          const { app, module, context, messageKey = "msg" }: LogDescriptor = log
          return `[${[app, module, context].filter(Boolean).join("::")}] ${
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            log[messageKey as keyof LogDescriptor]
          }`
        },
      })
    )
  }

  return pino({
    ...loggerOptions,
    level: process.env.LOG_LEVEL ?? "info",
    messageKey: "message",
    formatters: {
      level: (label) => {
        return { level: label }
      },
    },
  })
}

/**
 * Main logger instance
 */
const mainLogger = loggerFactory()

/**
 * export the main logger instance
 */
export const getLogger = () => mainLogger
