import typescript from "@rollup/plugin-typescript"

/**
 * @type {(input: string, path?: string, dependencies?: string[]) => import('rollup').RollupOptions}
 */
function builder(input, path = "index", dependencies = []) {
  return {
    input: `src/${input}.ts`,
    external: ["pino", "pino-pretty", ...dependencies],
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
        compilerOptions: {
          // declaration: false,
          // declarationMap: false,
          // noEmit: true,
        },
      }),
    ],
    output: [
      { file: `.build/${path}.cjs`, sourcemap: true, format: "cjs" },
      { file: `.build/${path}.mjs`, sourcemap: true, format: "es" },
    ],
  }
}

/**
 * @type Array<import('rollup').RollupOptions>
 */
export default [
  builder("index"),
  // builder("nestjs/LoggerServiceClass", "nestjs", ["@nestjs/common"]),
]
