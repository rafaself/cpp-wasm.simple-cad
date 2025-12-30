# AGENTS.md — Source of Truth

**THIS FILE IS THE SINGLE SOURCE OF TRUTH FOR THE PROJECT ARCHITECTURE.**

> **Note for AI Agents:** If during development you identify inconsistencies, gaps, or improvement opportunities in this documentation, **suggest and request changes**. Documentation must evolve alongside the project.

---

## 1. Vision and Philosophy

### Product

High-performance vector CAD editor with world-class UX, inspired by Figma.

### Development Philosophy

| Principle                 | Description                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------- |
| **State of the Art**      | We pursue industry best practices. Mediocre code is unacceptable.                       |
| **Quality > Speed**       | Fewer excellent features > many mediocre features.                                      |
| **Performance as Design** | Performance is decided at architecture level, not as late optimization.                 |
| **Zero Compromise on UX** | Interactions must be instantaneous (< 16ms) and fluid.                                  |
| **Planned Extensibility** | Architecture must allow extension for: vertical domains (electrical, hydraulic) and 3D. |

### Current Focus

Solidify the **2D CAD foundation**: drawing tools, selection, transformation, text, and persistence. The core must be **generic**, **extensible**, and **domain-agnostic**.

---

## 2. Architecture: C++ Engine-First (Strict)

The architecture follows the **Engine-First** model, where the C++ Engine (WASM) is the absolute authority over all document data.

### Application Layers

1. **React (Presentation Layer)**

   - Manages only UI state: active tool, viewport (zoom/pan), preferences, modals
   - Captures mouse/keyboard events and dispatches to Engine via commands
   - **Does NOT maintain document entity state**

2. **WASM Bridge (Communication Layer)**

   - Binary commands (JS → Engine): operations are serialized and sent in batch
   - Event Stream (Engine → JS): Engine notifies changes via event polling
   - Zero parsing overhead — direct binary communication

3. **C++ Engine (Domain Layer — Source of Truth)**

   - **Document State**: entities, geometry, properties, hierarchies
   - **Selection**: which entities are selected
   - **History**: complete transactional undo/redo
   - **Spatial Index**: BVH/Quadtree for O(log n) picking
   - **Transform System**: move, resize, rotate, vertex drag
   - **Text Layout Engine**: line breaking, glyph positioning, rich text
   - **Render Buffer Generation**: tessellation, text quads, grid, overlays
   - **Draft System**: shapes under construction (ephemeral entities)
   - **Serialization**: binary save/load

4. **WebGL2 Renderer (Graphics Backend)**
   - Stateless — only reads Engine buffers and renders
   - Does not calculate geometry, does not maintain state
   - Shaders for tessellated shapes and text quads

### Data Flow

```
User Input → React Event → Engine Command → Engine Update → Render Buffer → WebGL Draw
                                   ↓
                            Event Stream → React UI Update (if needed)
```

---

## 3. Responsibility Separation (Strict)

### C++ Engine — Absolute Authority

| Responsibility               | Description                                    |
| ---------------------------- | ---------------------------------------------- |
| **Document State**           | Entities, geometry, properties, hierarchies    |
| **Selection**                | Which entities are selected                    |
| **Undo/Redo**                | Complete transactional history                 |
| **Picking**                  | Hit testing with spatial indexing              |
| **Transformations**          | Move, resize, rotate, vertex drag              |
| **Snapping**                 | Grid, object, guideline snapping               |
| **Text Layout**              | Line breaking, glyph positioning, rich text    |
| **Serialization**            | Binary save/load                               |
| **Render Buffer Generation** | Shape tessellation, text quads, grid, overlays |
| **Geometric Validation**     | Bounds, constraints, intersections             |
| **Draft/Preview Entities**   | Shapes under construction during drag          |
| **Grid Rendering**           | Generate grid lines/dots in render buffer      |
| **Overlays**                 | Selection handles, snap guides, cursor hints   |

### React — Interface Only

| Responsibility           | Description                                 |
| ------------------------ | ------------------------------------------- |
| **Active Tool**          | Which tool is selected                      |
| **Viewport**             | Zoom, pan, canvas size                      |
| **Preferences**          | Grid settings, snap options, theme          |
| **UI State**             | Modals, panels, loading states              |
| **Event Capture**        | Capture mouse/keyboard → dispatch to Engine |
| **Render Orchestration** | Call WebGL with Engine buffers              |

### WebGL2 Renderer — Pure Graphics Backend

| Responsibility           | What it does NOT do            |
| ------------------------ | ------------------------------ |
| Renders received buffers | Does not calculate geometry    |
| Manages shaders          | Does not maintain entity state |
| Uploads textures         | Does not do picking            |

---

## 4. Absolute Rules (Non-Negotiable)

### ❌ FORBIDDEN

| Violation                                | Why It's Critical                            |
| ---------------------------------------- | -------------------------------------------- |
| Keep shape list in Zustand               | State duplication → desynchronization        |
| Calculate geometry in JS                 | Numeric inconsistency, poor performance      |
| Cache entity properties in React         | Shadow state violates single source of truth |
| Iterate entities in JS to find something | O(n) vs O(log n) from spatial index          |
| Do transform math in frontend            | Different precision than Engine              |
| Store text content in React              | Engine is authority                          |
| Re-render React on each pointermove      | Performance: use Engine directly             |

### ✅ MANDATORY

| Practice                      | Justification                                   |
| ----------------------------- | ----------------------------------------------- |
| Queries via Engine            | `pick()`, `getEntityAabb()`, `getSelectedIds()` |
| Modifications via Commands    | Binary batch, transactional                     |
| Transform via Session         | `begin/update/commit` pattern                   |
| Zero-allocation in hot paths  | pointermove, drag, render loops                 |
| Specific selectors in Zustand | Avoid unnecessary re-renders                    |

### VERY IMPORTANT!

**Global project rule:** There is NO backward compatibility during migrations.

**Any form of backward compatibility MUST be BANNED. This is a strict, prohibitive rule.**

- Do not create shims, legacy adapters, “deprecated” re-exports, alias modules, or key remapping layers to preserve old APIs/imports.
- If something breaks due to a refactor, fix it at the call sites immediately. Breaking changes are expected and acceptable at this stage.
- This project is in active development, so there is no requirement to support older versions.
- Do not leave “temporary compatibility”, “migration bridge”, or “keep for legacy” comments in committed code.
- The codebase must converge to one canonical implementation per module—no duplicate sources of truth.

---

## 5. Performance Requirements

### Targets

| Metric                | Target         | Justification              |
| --------------------- | -------------- | -------------------------- |
| Frame time            | < 16ms (60fps) | Fluid interaction          |
| Input latency         | < 8ms          | Instantaneous response     |
| Picking               | O(log n)       | Spatial indexing mandatory |
| Command batch         | < 1ms          | Binary, zero parsing       |
| Render buffer rebuild | Incremental    | Only modified entities     |

### Hot Path Rules (C++)

```cpp
// ❌ Forbidden in hot paths
std::string, std::vector resize, new/delete, std::map lookup

// ✅ Mandatory
Fixed-size buffers, arena allocation, POD structs
```

### Hot Path Rules (JS)

```typescript
// ❌ Forbidden in hot paths
Object creation, array spread, closure creation

// ✅ Mandatory
Reuse objects, typed arrays, direct buffer access
```

---

## 6. Source of Truth & Ownership

- **Engine is authoritative** for: entities, geometry, styles, selection, history/undo, text content/layout, render buffers.
- **Frontend is transient**: tool mode, viewport, preferences, modals, pointer/key state. Zustand is UI-only.
- **Forbidden**: canonical geometry/state in JS stores; shadow copies of engine entities; `runtime.engine.*` usage outside `frontend/engine/**`.
- **Boundaries**: feature code must go through EngineRuntime facades (text/pick/draft/transform/io/etc.), not native engine instances.

---

## 7. Future Extensibility

### Preparation for Vertical Domains (Electrical, etc.)

| Principle               | Implementation                                            |
| ----------------------- | --------------------------------------------------------- |
| **Agnostic Core**       | Engine doesn't know "electrical symbols", only primitives |
| **Entity Flags**        | Extensible flag system for domain metadata                |
| **Layer Semantics**     | Generic layers, semantics defined externally              |
| **Component System**    | (Future) Entities composed of components                  |
| **Plugin Architecture** | (Future) Domain as separate module                        |

### Preparation for 3D

| Current Decision            | Future Impact                 |
| --------------------------- | ----------------------------- |
| Float coordinates (not int) | Extensible for Z              |
| Transform matrix ready      | 4x4 when needed               |
| Shader architecture         | Add 3D passes                 |
| Render buffer format        | Extensible vertex format      |
| Picking system              | Ray casting vs screen picking |

### What to Avoid Now

| Anti-Pattern                      | Why It Limits           |
| --------------------------------- | ----------------------- |
| Hardcode 2D assumptions in Engine | Blocks 3D extension     |
| Domain logic in core              | Prevents plugins        |
| Tight coupling between layers     | Hinders refactoring     |
| String IDs in core                | Performance and interop |

---

## 8. Mandatory Synchronizations

### Viewport → Engine

Whenever viewport changes, **mandatory** sync with Engine:

```typescript
// When scale changes (zoom)
runtime.setViewScale(viewTransform.scale);
```

**Why:** Engine uses scale to calculate picking tolerance and stroke widths.

---

## 9. Engine ↔ Frontend Communication

### Commands (JS → Engine)

```typescript
// Binary command buffer - zero parsing overhead
runtime.apply([
  { op: CommandOp.UpsertRect, id, rect: {...} },
  { op: CommandOp.SetTextAlign, align: {...} }
]);
```

### Events (Engine → JS)

```typescript
// Polling-based event stream
const { events } = runtime.pollEvents(MAX_EVENTS);
// EventTypes: DocChanged, EntityCreated, SelectionChanged, etc.
```

### Interactive Transform Protocol

```typescript
// Frame 0: Start
runtime.beginTransform(ids, mode, specificId, vertexIndex, startX, startY);

// Frame 1..N: Update (NO React state updates!)
runtime.updateTransform(worldX, worldY);

// Frame N+1: Commit
const result = runtime.commitTransform();
// Only NOW does React receive events and update UI
```

---

## 10. Code Quality Standards

### General

- Consider Type Safety always when possible

### C++

- Modern C++17/20
- RAII mandatory
- No raw `new`/`delete` — use containers or arenas
- `constexpr` when possible
- POD structs for WASM-shared data
- Header guards + `#pragma once`

### TypeScript

- Strict mode mandatory
- No unjustified `any`
- Prefer `unknown` + type guards
- Typed interfaces for all commands
- No side effects in selectors

### Tests

- C++ tests via CTest (unit and integration)
- Frontend tests via Vitest
- Tests must be deterministic
- Coverage on critical logic

---

## 11. Internationalization (i18n)

### Current State

- **UI display text**: Portuguese (pt-BR)
- **Code internals**: English (classes, functions, variables, comments)

### Rules

| Context                       | Language   | Example                                           |
| ----------------------------- | ---------- | ------------------------------------------------- |
| Class/function/variable names | English    | `TextLayoutEngine`, `handlePointerDown`           |
| Code comments                 | English    | `// Calculate bounding box`                       |
| Console logs (dev)            | English    | `console.log('Pick result:', pick)`               |
| UI labels, buttons, messages  | Portuguese | `"Salvar"`, `"Desfazer"`, `"Ferramenta de Texto"` |
| Error messages (user-facing)  | Portuguese | `"Erro ao carregar arquivo"`                      |

### Future Scalability

- All user-facing strings must be **extractable** for future i18n
- Use constants or a simple key-value system, NOT hardcoded inline strings
- Prepare for English translation in future releases

```typescript
// ✅ CORRECT: Extractable
const LABELS = {
  save: "Salvar",
  undo: "Desfazer",
  textTool: "Ferramenta de Texto",
};
button.textContent = LABELS.save;

// ❌ WRONG: Hardcoded inline
button.textContent = "Salvar";
```

---

## 12. Additional Documentation

| Document                            | Content                        |
| ----------------------------------- | ------------------------------ |
| `docs/agents/engine-api.md`         | Complete C++ API reference     |
| `docs/agents/frontend-patterns.md`  | Mandatory React patterns       |
| `docs/agents/text-system.md`        | Text system                    |
| `docs/agents/workflows.md`          | Development recipes            |
| `docs/ENGINE_FIRST_GOVERNANCE.md`   | Engine-first governance policy |
| `docs/DEAD_CODE_REMOVAL_PROCESS.md` | Safe dead-code process         |
| `docs/AGENT_RUNBOOK.md`             | Agent operating checklist      |

---

## 13. How to Run Checks

```bash
# Governance (budgets, boundaries, manifest)
cd frontend && pnpm governance:check

# Doc drift guard (AGENTS + governance doc)
node scripts/check_docs_references.js

# Regenerate engine API manifest (after bindings changes)
node scripts/generate_engine_api_manifest.js

# Frontend tests
cd frontend && pnpm test

# C++ tests
cd cpp/build_native && ctest --output-on-failure
```

---

## 14. Commands (general)

```bash
# Full build
make fbuild

# Dev (frontend only)
cd frontend && pnpm dev

# Code size report
./scripts/loc-report.sh
```

---

## 15. Code Size Governance (SRP)

To maintain code quality and prevent monolithic files, the following size limits are enforced.

### File Size Thresholds

| Area                         | Review Threshold | Mandatory Refactor |
| ---------------------------- | ---------------- | ------------------ |
| C++ engine (`cpp/engine/**`) | > 450 LOC        | > 800 LOC          |
| C++ tests (`cpp/tests/**`)   | > 600 LOC        | > 1000 LOC         |
| TS/TSX (`frontend/**`)       | > 350 LOC        | > 600 LOC          |
| TS tests                     | > 400 LOC        | > 700 LOC          |

### Function Length Guardrails

- **Review**: Any function > 80 LOC
- **Mandatory refactor**: Any function > 120 LOC
- **Exception**: Data-heavy switch statements with clear 1:1 case mapping

### Responsibility Limits

- **2 responsibilities max** for hot-path files (input handlers, render loops)
- **3 responsibilities max** for orchestrators
- **1 responsibility** for domain logic (pure algorithms, data structures)

### Forbidden Patterns

| Pattern                   | Why Forbidden                   |
| ------------------------- | ------------------------------- |
| `utils.ts` > 200 LOC      | Becomes god-file dumping ground |
| Manager class > 500 LOC   | Hidden monolith                 |
| Cross-layer imports       | Engine-First violation          |
| Document state in Zustand | Engine owns document, not React |

### Enforcement

```bash
# Run size check (also runs in CI)
./scripts/loc-report.sh
```

### Documentation

Budgets and exceptions live in `scripts/file_size_budget.json` and `scripts/file_size_budget_exceptions.json`.
