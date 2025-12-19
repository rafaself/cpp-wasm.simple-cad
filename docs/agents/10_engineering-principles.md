# 10_engineering-principles

Scope
- High-level engineering principles that apply across the repository.

Rules (imperative)
- MUST apply Single Responsibility Principle: modules and functions should have one reason to change.
- MUST avoid duplicated logic; centralize shared behavior.
- MUST prefer simple, explicit solutions (KISS).
- MUST NOT add abstractions for hypothetical future needs (YAGNI).
- MUST maintain clear boundaries between UI, domain, and infrastructure.
- MUST use meaningful names and avoid ephemeral identifiers like `data2` or `temp`.
- MUST use types; avoid unchecked `any` unless documented and justified.

Change guidance
- Prefer minimal surface-area changes that reuse existing patterns.
- Document design trade-offs when introducing new patterns.
