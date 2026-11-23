import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    nestjs: "src/adapters/nestjs.adapter.ts",
    fastify: "src/adapters/fastify.adapter.ts",
  },
  outDir: ".build",
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  shims: true,
  fixedExtension: true,
  deps: {
    neverBundle: ["pino", "pino-pretty", "@nestjs/common", "fastify"],
  },
})
