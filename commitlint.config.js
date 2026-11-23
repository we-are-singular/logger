const ALLOWED_SCOPES = ["root", "core", "nestjs", "fastify", "deps"]
const NON_SCOPED_TYPES = ["build", "ci", "docs", "tools", "style", "release"]

export default {
  extends: ["@commitlint/config-conventional"],
  ignores: [message => /^release:\s/i.test(message)],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "build",
        "ci",
        "tools",
        "docs",
        "feat",
        "feature",
        "fix",
        "perf",
        "refactor",
        "design",
        "style",
        "test",
        "release",
      ],
    ],
    "subject-case": [0],
    "repo-scope": [2, "always"],
    "subject-after-ticket-case": [2, "always"],
  },
  plugins: [
    {
      rules: {
        "subject-after-ticket-case": (parsed, when) => {
          if (!parsed.subject) return [false, "Subject is required"]

          const subject = String(parsed.subject).trim()
          const subjectWithoutTicket = subject.replace(/^(?:(?:ISSUE|TICKET)-\d+|#\d+)(?::)?\s+/, "")
          const isLowercase =
            subjectWithoutTicket.length > 0 && subjectWithoutTicket === subjectWithoutTicket.toLowerCase()
          const isValid = when === "never" ? !isLowercase : isLowercase
          const expectation = when === "never" ? "must not be entirely lowercase" : "must be lowercase"

          return [isValid, `Subject ${expectation} after an optional ISSUE-123, TICKET-123, or #123 prefix`]
        },
        "repo-scope": (parsed, when) => {
          const hasValidScope = parsed.scope
            ? ALLOWED_SCOPES.includes(parsed.scope)
            : NON_SCOPED_TYPES.includes(parsed.type)
          const isValid = when === "never" ? !hasValidScope : hasValidScope

          return [
            isValid,
            `Scope must be one of [${ALLOWED_SCOPES.join(", ")}]; only ${NON_SCOPED_TYPES.join(", ")} may omit it`,
          ]
        },
      },
    },
  ],
}
