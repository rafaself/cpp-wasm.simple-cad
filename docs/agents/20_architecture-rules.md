# 20_architecture-rules

Scope
- Repository-wide architectural constraints and expectations.

Rules (imperative)
- Domain logic MUST be framework-agnostic; do not place React-specific code in domain modules.
- Prefer pure functions for domain rules; isolate side effects.
- Side effects (IO, network, storage) MUST be isolated in dedicated modules.
- Avoid circular dependencies; prefer explicit data flow.
- New external dependencies MUST be justified in the change plan.

Decision constraints
- When multiple solutions exist, prefer those that minimize surface area and reuse existing patterns.
- Prefer deterministic, explicit solutions over convenience.
