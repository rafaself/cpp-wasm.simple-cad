# 40_cad-canvas

Applies when: tasks touch CAD, canvas tools, editor features, or serialization of drawable entities.

Rules (imperative)
- Tools MUST be deterministic and reversible (support undo/redo).
- MUST separate: tool intent (user action), model update (domain), and render (view).
- Every drawable element MUST be serializable to JSON.
- MUST NOT store computed UI-only values in the persisted model.
- Validate inputs; never trust external data or file fixtures.

Performance & data model
- Prefer immutable or well-bounded mutable operations in hot paths.
- Keep model serialization stable; do not change persisted shape without a migration plan.
