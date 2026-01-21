# Domain API Reference (Electrical Core)

Status: Draft (Placeholder)
Owner: TBD
Created: 2026-01-21
Last Updated: 2026-01-21

## Scope
This document defines the public API for the Electrical domain kernel. The API must remain CAD-engine-agnostic and interact with Atlas only through runtime facades and integration transactions.

## Current State
- The domain kernel API is not yet documented here.
- When defined, it MUST preserve engine-agnostic boundaries and document all transaction semantics.

## Integration Transactions (Normative)
The domain kernel MUST provide explicit transaction semantics so that Atlas (geomZ) and Electrical (semantic height)
changes can be committed or rolled back atomically.

Minimum contract:
- `beginTransaction(label: string)` returns a transaction handle with `commit()` and `rollback()` methods.
- Domain operations invoked during a transaction MUST be isolated until `commit()`.
- `rollback()` MUST fully revert any staged changes and MUST be safe to call after a failed `commit()`.

Recommended orchestration:
- Integration layer begins an Atlas history entry.
- Domain transaction begins.
- Integration applies Atlas commands + domain operations.
- Domain commit runs first; if it fails, Atlas rolls back.
- Atlas history entry commits last.

## GeomZ vs Semantic Height (Normative)
- **GeomZ** is the canonical elevation stored in Atlas and used for geometry truth.
- **Semantic height** is an Electrical-only parameter (mounting height, standards) and MUST NOT be stored in Atlas.
- Any user action that sets both values MUST be executed as a single integration transaction that calls:
  - Atlas `setEntityGeomZ(...)` (geomZ), and
  - Electrical `setSemanticHeight(...)` (domain-only),
  without cross-kernel leakage or implicit conversions.

## Planned Sections
- Command/query surface (names, payloads, error codes).
- Validation outputs and event semantics.
- Domain extension block schema (persistence contract).
