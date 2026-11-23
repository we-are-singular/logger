import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type * as FastifyModule from "../../src/adapters/fastify.adapter"
import type * as NestModule from "../../src/adapters/nestjs.adapter"
import type * as CoreModule from "../../src/index"

const buildDir = path.resolve(import.meta.dirname, "../../.build")

describe("built package ESM, CJS, and subpath smoke tests", () => {
  it("emits ESM, CJS, and declaration files for root, ./nestjs, and ./fastify", () => {
    for (const entry of ["index", "nestjs", "fastify"]) {
      expect(fs.existsSync(path.join(buildDir, `${entry}.mjs`))).toBe(true)
      expect(fs.existsSync(path.join(buildDir, `${entry}.cjs`))).toBe(true)
      expect(fs.existsSync(path.join(buildDir, `${entry}.d.mts`))).toBe(true)
      expect(fs.existsSync(path.join(buildDir, `${entry}.d.cts`))).toBe(true)
    }
  })

  it("keeps core bundle free of static pino-pretty, @nestjs/common, and fastify imports", () => {
    const esmCore = fs.readFileSync(path.join(buildDir, "index.mjs"), "utf8")
    const cjsCore = fs.readFileSync(path.join(buildDir, "index.cjs"), "utf8")

    for (const bundle of [esmCore, cjsCore]) {
      expect(bundle).not.toMatch(/from\s+["']pino-pretty["']/)
      expect(bundle).not.toMatch(/from\s+["']@nestjs\/common["']/)
      expect(bundle).not.toMatch(/from\s+["']fastify["']/)
    }
  })

  it("imports and executes built ESM entrypoints cleanly", async () => {
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
  })

  it("requires and executes built CJS entrypoints cleanly", () => {
    const require = createRequire(import.meta.url)
    const core = require(path.join(buildDir, "index.cjs")) as typeof CoreModule
    const nest = require(path.join(buildDir, "nestjs.cjs")) as typeof NestModule
    const fast = require(path.join(buildDir, "fastify.cjs")) as typeof FastifyModule

    const { logger, records } = core.createMemoryLogger({ app: "CjsApp" })
    logger.withModule("Core").info("cjs core ok")
    nest.createNestJSLogger(logger).withModule("Nest").log("cjs nest ok")
    fast.createFastifyLogger(logger).child({ reqId: "cjs-1" }).info({ ok: true }, "cjs fastify ok")

    expect(records).toHaveLength(3)
    expect(records[0]).toMatchObject({ app: "CjsApp", module: "Core", message: "cjs core ok" })
    expect(records[1]).toMatchObject({ app: "CjsApp", module: "Nest", message: "cjs nest ok" })
    expect(records[2]).toMatchObject({ app: "CjsApp", reqId: "cjs-1", ok: true, message: "cjs fastify ok" })
  })
})
