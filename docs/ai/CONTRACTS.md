# System Contracts & Integration

## 1. Engine ↔ Frontend (Atlas Bridge)

- **Source of Truth**: `packages/engine/engine/bindings.cpp`
- **JS Facade**: `apps/web/engine/Runtime.ts` (and related facades)
- **Protocol**: 
  - **Commands**: Binary buffers for document mutations.
  - **Queries**: Direct WASM heap access for read-only properties (via Embind).
  - **Events**: Polling-based event loop with an overflow recovery contract defined in `AGENTS.md`.

## 2. Frontend ↔ Backend (REST API)

- **Source of Truth**: `apps/api/app/main.py` (FastAPI)
- **Contract Type**: OpenAPI / Swagger.
- **Client Generation**: Currently hand-written fetchers (Future: Generate via `openapi-typescript`).
- **Standard**: All endpoints must return JSON. Errors must follow RFC 7807 (Problem Details for HTTP APIs).

## 3. Data Persistence (Snapshots)

- **Format**: Custom Binary with Magic Header + Versioning.
- **Location**: `packages/engine/engine/persistence/snapshot.cpp`.
- **Policy**: No backward compatibility for internal development versions. Production versions require an offline migration tool.

## 4. UI Design Tokens

- **Source of Truth**: `apps/web/theme/tokens.css`
- **Implementation**: CSS Variables mapped to Tailwind utilities.
- **Enforcement**: Governance scripts in `tooling/governance/` (check hex colors, arbitrary values, etc.).
