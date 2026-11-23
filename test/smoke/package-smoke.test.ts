import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type * as FastifyModule from "../../src/adapters/fastify.adapter"
import type * as NestModule from "../../src/adapters/nestjs.adapter"
import type * as CoreModule from "../../src/index"

const buildDir = path.resolve(import.meta.dirname, "../../.build")

describe("built package ESM, CJS, and subpath smoke tests", () => {
  it("emits ESM, CJS, and clean declaration files without leaking @internal symbols", () => {
    for (const entry of ["index", "nestjs", "fastify"]) {
      expect(fs.existsSync(path.join(buildDir, `${entry}.mjs`))).toBe(true)
      expect(fs.existsSync(path.join(buildDir, `${entry}.cjs`))).toBe(true)
      expect(fs.existsSync(path.join(buildDir, `${entry}.d.mts`))).toBe(true)
      expect(fs.existsSync(path.join(buildDir, `${entry}.d.cts`))).toBe(true)
    }

    const dtsFiles = fs.readdirSync(buildDir).filter(file => file.endsWith(".d.mts") || file.endsWith(".d.cts"))
    for (const file of dtsFiles) {
      const content = fs.readFileSync(path.join(buildDir, file), "utf8")
      expect(content).not.toContain("INTERNAL_CONSTRUCT")
      expect(content).not.toContain("InternalInit")
      expect(content).not.toContain("setPrettyLoaderForTesting")
    }
  })

  it("keeps all core bundles and shared chunks free of static pino-pretty, @nestjs/common, and fastify imports", () => {
    const coreFiles = fs
      .readdirSync(buildDir)
      .filter(
        file =>
          (file.endsWith(".mjs") || file.endsWith(".cjs")) &&
          !file.startsWith("nestjs.") &&
          !file.startsWith("fastify.")
      )

    expect(coreFiles.length).toBeGreaterThanOrEqual(2)

    for (const file of coreFiles) {
      const bundle = fs.readFileSync(path.join(buildDir, file), "utf8")
      expect(bundle).not.toMatch(/from\s+["']pino-pretty["']/)
      expect(bundle).not.toMatch(/from\s+["']@nestjs\/common["']/)
      expect(bundle).not.toMatch(/from\s+["']fastify["']/)
      expect(bundle).not.toMatch(/require\(["']@nestjs\/common["']\)/)
      expect(bundle).not.toMatch(/require\(["']fastify["']\)/)
      // pino-pretty must only appear inside lazy createRequire(), never as a top-level bare require().
      expect(bundle).not.toMatch(/^const\s+\w+\s*=\s*require\(["']pino-pretty["']\)/m)
    }
  })

  it("imports and executes built ESM entrypoints including pretty mode", async () => {
    const core = (await import(pathToFileURL(path.join(buildDir, "index.mjs")).href)) as typeof CoreModule
    const nest = (await import(pathToFileURL(path.join(buildDir, "nestjs.mjs")).href)) as typeof NestModule
    const fast = (await import(pathToFileURL(path.join(buildDir, "fastify.mjs")).href)) as typeof FastifyModule

    const { logger, records } = core.createMemoryLogger({ app: "EsmApp" })
    logger.withModule("Core").info("esm core ok")
    nest.createNestJSLogger(logger).withModule("Nest").log("esm nest ok")
    fast.createFastifyLogger(logger).child({ reqId: "esm-1" }).info({ ok: true }, "esm fastify ok")

    expect(records).toHaveLength(3)
    expect(records[0]).toMatchObject({ app: "EsmApp", module: "Core", message: "esm core ok" })
    expect(records[1]).toMatchObject({ app: "EsmApp", module: "Nest", message: "esm nest ok" })
    expect(records[2]).toMatchObject({ app: "EsmApp", reqId: "esm-1", ok: true, message: "esm fastify ok" })

    const prettyChunks: string[] = []
    const prettyLogger = core.createLogger({
      app: "EsmPretty",
      module: "Dev",
      format: "pretty",
      sync: true,
      destination: {
        write(chunk: string) {
          prettyChunks.push(chunk)
        },
      },
    })
    prettyLogger.info("esm pretty ok")
    expect(prettyChunks.join("")).toContain("[EsmPretty::Dev] esm pretty ok")
  })

  it("requires and executes built CJS entrypoints, keeps pino-pretty lazy in JSON mode, and supports pretty mode", () => {
    const require = createRequire(import.meta.url)
    const prettyResolved = require.resolve("pino-pretty")
    delete require.cache[prettyResolved]

    const core = require(path.join(buildDir, "index.cjs")) as typeof CoreModule
    const nest = require(path.join(buildDir, "nestjs.cjs")) as typeof NestModule
    const fast = require(path.join(buildDir, "fastify.cjs")) as typeof FastifyModule

    const { logger, records } = core.createMemoryLogger({ app: "CjsApp" })
    logger.withModule("Core").info("cjs core ok")
    nest.createNestJSLogger(logger).withModule("Nest").log("cjs nest ok")
    fast.createFastifyLogger(logger).child({ reqId: "cjs-1" }).info({ ok: true }, "cjs fastify ok")

    // JSON mode must not have loaded pino-pretty.
    expect(require.cache[prettyResolved]).toBeUndefined()

    expect(records).toHaveLength(3)
    expect(records[0]).toMatchObject({ app: "CjsApp", module: "Core", message: "cjs core ok" })
    expect(records[1]).toMatchObject({ app: "CjsApp", module: "Nest", message: "cjs nest ok" })
    expect(records[2]).toMatchObject({ app: "CjsApp", reqId: "cjs-1", ok: true, message: "cjs fastify ok" })

    const prettyChunks: string[] = []
    const prettyLogger = core.createLogger({
      app: "CjsPretty",
      module: "Dev",
      format: "pretty",
      sync: true,
      destination: {
        write(chunk: string) {
          prettyChunks.push(chunk)
        },
      },
    })
    prettyLogger.info("cjs pretty ok")
    expect(prettyChunks.join("")).toContain("[CjsPretty::Dev] cjs pretty ok")
  })

  it("preserves LoggerClass identity across mixed ESM and CJS adapter boundaries", async () => {
    const require = createRequire(import.meta.url)
    const esmCore = (await import(pathToFileURL(path.join(buildDir, "index.mjs")).href)) as typeof CoreModule
    const cjsNest = require(path.join(buildDir, "nestjs.cjs")) as typeof NestModule
    const cjsFast = require(path.join(buildDir, "fastify.cjs")) as typeof FastifyModule

    const esmMem = esmCore.createMemoryLogger({ app: "CrossRealm" })
    cjsNest.createNestJSLogger(esmMem.logger).withModule("NestCjs").log("from cjs nest")
    cjsFast.createFastifyLogger(esmMem.logger).child({ reqId: "cross-1" }).info("from cjs fastify")

    expect(esmMem.records).toHaveLength(2)
    expect(esmMem.records[0]).toMatchObject({ app: "CrossRealm", module: "NestCjs", message: "from cjs nest" })
    expect(esmMem.records[1]).toMatchObject({ app: "CrossRealm", reqId: "cross-1", message: "from cjs fastify" })
  })
})
