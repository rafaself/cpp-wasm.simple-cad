# 00_operating-model

Purpose
- Explain the required mental model and stepwise operating model for agents.

Operating Model (detailed)
- Investigate first: gather minimal artifacts needed to understand the task (files, failing tests, reproduction steps).
- Produce a concise plan listing steps and files to modify.
- When the Change Classification indicates explicit approval is required, STOP and request approval.
- Implement minimal, reversible edits; prefer multiple small commits.
- Verify: run available tests, linters, and provide explicit verification commands if runtime checks cannot be executed.

Agent roles
- Investigator: read-only; creates reports/hypotheses.
- Implementer: makes minimal, authorized changes only.
- Reviewer: validates changes, tests, and PR descriptions.

Prompt hooks
- When unsure, respond with: "I need clarification on X before proceeding."
- When proposing changes include: "What I will change" and "What I will not change".
