const { config, presets, overrides } = require("@we-are-singular/eslint-config")

module.exports = config(
  //
  presets.typescript,
  presets.prettier,
  presets.markdown,
  {
    overrides: [
      overrides.namingConvention(["src/**/*.ts"], []),
      // overrides.typescript(["src/**/*.ts"], {
      //   parserOptions: {
      //     project: "./tsconfig.json",
      //   },
      // }),
    ],
    ignorePatterns: [".eslintrc.*", "node_modules"],
  }
)
