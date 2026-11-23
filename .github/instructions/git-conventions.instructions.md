---
applyTo: "**"
---

# Git Commit Conventions

## Format

```text
type(scope): subject
```

## Types

Allowed types: `build`, `ci`, `tools`, `docs`, `feat`, `feature`, `fix`, `perf`, `refactor`, `design`, `style`, `test`, `release`.

Prefer conventional `feat` for new features. `feature` remains an accepted fallback/alias. Never use `chore`; use `tools` or `build`.

## Scopes

Allowed scopes (defined in `commitlint.config.js`):

`root`, `core`, `nestjs`, `fastify`, `deps`

Scope is required for code changes. `build`, `ci`, `docs`, `tools`, `style`, and `release` may omit it when a change is cross-cutting. An explicit scope must always be valid.

## Subject

Use lowercase imperative mood with no period at the end. Generic ticket prefixes are allowed when relevant: `ISSUE-123`, `TICKET-123`, or `#123`.

## Examples

```text
feat(core): add immutable child derivation
fix(fastify): avoid duplicate logger allocations in child
fix(nestjs): omit undefined stack in error logs
test(core): verify redaction of nested credentials
docs: add v2 to v3 migration guide
ci: run node compatibility matrix
```
