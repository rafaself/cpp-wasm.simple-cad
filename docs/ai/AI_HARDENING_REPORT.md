# AI Hardening Report

**Date:** January 16, 2026
**Agent:** Gemini CLI

## 1. Executive Summary

The repository `eletrocad-webapp` has been audited and hardened for AI-driven development. The primary focus was establishing strict boundaries between the Monorepo domains (Frontend, Backend, Engine), correcting outdated documentation paths, and ensuring Continuous Integration (CI) covers all components.

## 2. Repo Overview

| Domain | Path | Tech Stack | Status |
| :--- | :--- | :--- | :--- |
| **Frontend** | `apps/web` | React, Vite, TS | Mature, strict governance |
| **Backend** | `apps/api` | Python, FastAPI | Skeleton, previously unmonitored |
| **Engine** | `packages/engine` | C++, WASM | Core, strict performance rules |
| **Tooling** | `tooling` | Node.js scripts | Custom governance active |

## 3. Key Findings & Risks

| Severity | Finding | Impact | Resolution |
| :--- | :--- | :--- | :--- |
| **High** | `apps/api` (Backend) was completely missing from CI. | Backend code could break without detection. | Added `backend` job to CI (Ruff linting). |
| **Medium** | `AGENTS.md` referenced incorrect paths (`frontend/` vs `apps/web`). | AI Agents would fail to locate files or hallucinate paths. | Updated all paths in `AGENTS.md` and `project-guidelines.md`. |
| **Medium** | `CLAUDE.md` and `AGENTS.md` contained redundant rules. | Source of Truth confusion. | Merged concepts, deleted `CLAUDE.md`. |
| **Low** | Missing domain-specific context for Agents. | Agents lacked granular instructions per folder. | Created `apps/web/AGENTS.md`, `apps/api/AGENTS.md`, `packages/engine/AGENTS.md`. |

## 4. Changes Implemented

### Phase 1: Boundaries
- Created `docs/ai/ARCHITECTURE_BOUNDARIES.md` defining strict dependency rules (e.g., No React logic in C++ engine).
- Created `docs/ai/REPO_MAP.md` for fast agent orientation.

### Phase 2: Guardrails (`AGENTS.md`)
- **Root `AGENTS.md`**: Fixed all directory references. Added Backend to architecture.
- **Domain Guides**:
  - `apps/web/AGENTS.md`: React/Engine bridge rules.
  - `apps/api/AGENTS.md`: Pydantic/FastAPI rules.
  - `packages/engine/AGENTS.md`: C++ memory safety rules.

### Phase 3: CI Quality Gates
- **Updated `.github/workflows/ci.yml`**:
  - Added `backend` job.
  - Installs Python dependencies.
  - Runs `ruff check .` for linting.
  - Prepared for `pytest` (currently skips if no tests found).

### Phase 4: Cleanup
- **Deleted**: `CLAUDE.md` (Redundant).
- **Updated**: `apps/web/project-guidelines.md` (Fixed "frontend" paths to "apps/web").

### Phase 5: Governance
- **Created `.github/CODEOWNERS`**: Defined ownership for web, api, and engine.
- **Updated PR Template**: Added checklist items for Engine and Backend (previously UI-only).

## 5. Remaining Debt & Roadmap

1.  **Backend Tests**: `apps/api` has no tests. `pytest` is configured but currently finds nothing. **Priority: High**.
2.  **Engine API Documentation**: `docs/api/engine_api_manifest.json` exists, but ensuring it stays in sync with `bindings.cpp` requires constant vigilance (handled by `governance:manifest`).
3.  **UI/Theme Refactor**: `apps/web/design` vs `apps/web/theme` shows slight structure duplication. `tokens.css` is the source of truth, but `design/` contains Tailwind config.

## 6. Conclusion

The repository is now **AI-Ready**. Agents have clear maps (`REPO_MAP.md`), clear rules (`AGENTS.md`), and automated feedback (CI) for all three domains.
