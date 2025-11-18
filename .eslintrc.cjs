const { config, presets, overrides } = require("@we-are-singular/eslint-config")

module.exports = config(
  //
  presets.typescript,
  presets.prettier,
  {
    overrides: [
      overrides.namingConvention(["src/**/*.ts"], [], {
        import: ["PascalCase", "camelCase", "UPPER_CASE"],
      }),
      overrides.typescript(["src/**/*.ts"], { parserOptions: { project: "./tsconfig.json" } }),
    ],
    ignorePatterns: [".eslintrc.*", "node_modules", "*.md"],
  }
)
