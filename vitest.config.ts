import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "test/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", "coverage", ".build"],
    clearMocks: true,
    restoreMocks: true,
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["**/*.config.*", "**/*.d.ts", "src/core/types.ts", "**/test/**", "**/*.{test,spec}.*"],
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage",
    },
  },
})
