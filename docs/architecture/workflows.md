# Development Workflows

> Practical recipes for high-quality development.

---

## 1. General Principles

| Principle                | Application                             |
| ------------------------ | --------------------------------------- |
| **Minimal Surface Area** | Smallest change that solves the problem |
| **Engine-First**         | When in doubt, logic goes in C++        |
| **Test Before Commit**   | C++ and Frontend tests must pass        |
| **No Regressions**       | Performance cannot degrade              |

---

## 2. Adding New Drawing Primitive

### Checklist

1. **C++ Types** (`packages/engine/engine/core/types.h`)

   ```cpp
   struct FooRec {
       uint32_t id;
       // ... POD fields
   };
   ```

2. **C++ Command** (`packages/engine/engine/command/commands.h`)

   ```cpp
   enum class CommandOp : uint8_t {
       // ...
       UpsertFoo = XX,
   };
   ```

3. **C++ Storage** (`packages/engine/engine/engine.h`)

   ```cpp
   std::vector<FooRec> foos_;
   // ... CRUD methods
   ```

4. **C++ Implementation** (`packages/engine/engine/entity/entity_manager.cpp`)

   - Implement upsert, delete
   - Add to draw order

5. **C++ Picking** (`packages/engine/engine/interaction/pick_system.cpp`)

   - Add hit test for new primitive

6. **C++ Snapshot** (`packages/engine/engine/persistence/snapshot.cpp`)

   - Serialize/deserialize

7. **C++ Bindings** (`packages/engine/engine/bindings.cpp`)

   - Expose via Embind

8. **C++ Tests** (`packages/engine/tests/`)

   - Unit tests for CRUD and picking

9. **Frontend Command** (`apps/web/engine/core/commandBuffer.ts`)

   ```typescript
   export interface FooPayload { ... }
   // Add case in payloadByteLength and encodeCommandBuffer
   ```

10. **Frontend Tool** (`apps/web/features/editor/interactions/handlers/DraftingHandler.tsx`)

    - Add creation logic

11. **Frontend UI**

    - Add ToolType
    - Add toolbar button

12. **Frontend Tests**
    - Vitest for new functionality

---

## 3. Modifying Existing Entity Property

### Checklist

1. **C++ Struct** — Modify struct in `types.h`
2. **C++ Payload** — If command, update payload struct
3. **Snapshot Migration** — If persisted, migrate format
4. **Frontend Encoding** — Update `commandBuffer.ts`
5. **Tests** — Update C++ and Frontend tests

### ⚠️ Breaking Change?

If modification changes snapshot format:

- Increment snapshot version
- Implement migration
- Document in commit

---

## 4. Adding New Transform Mode

### Steps

1. **C++** (`packages/engine/engine/engine.h`)

   ```cpp
   enum class TransformMode : uint8_t {
       // ...
       NewMode = X,
   };
   ```

2. **C++ Logic** (`packages/engine/engine/engine.cpp`)

   - Implement in `updateTransform()`
   - Implement in `commitTransform()`

3. **Frontend Mapping** (`apps/web/engine/core/interactionSession.ts`)

   - Add constant

4. **Frontend Trigger** (`apps/web/features/editor/components/EngineInteractionLayer.tsx`)

   - Add condition to start

5. **Tests**

---

## 5. Debug Workflow

### Engine State

```typescript
// Stats
const stats = runtime.getStats();
console.log("Entities:", stats.rectCount, stats.lineCount, stats.polylineCount);

// Buffers
const positionMeta = runtime.getPositionBufferMeta();
console.log("Triangle vertices:", positionMeta.vertexCount);
```

### Picking Debug

```typescript
const pick = runtime.pickEx(worldX, worldY, tolerance, 0xff);
console.log("Pick result:", {
  id: pick.id,
  kind: PickEntityKind[pick.kind],
  subTarget: PickSubTarget[pick.subTarget],
  distance: pick.distance,
});
```

### Text Debug

```typescript
const meta = runtime.getTextContentMeta(textId);
const bytes = new Uint8Array(
  runtime.module.HEAPU8.buffer,
  meta.ptr,
  meta.byteCount
);
console.log("Text content:", new TextDecoder().decode(bytes));

const caretPos = runtime.getTextCaretPosition(textId, index);
console.log("Caret:", caretPos);
```

### Performance

```typescript
// Measure operation
const t0 = performance.now();
runtime.pickEx(x, y, tolerance, 0xff);
console.log("Pick time:", performance.now() - t0, "ms");
```

---

## 6. Build Commands

```bash
# Full build (WASM + Frontend)
make fbuild

# Frontend dev mode (hot reload)
cd apps/web && pnpm dev

# Rebuild WASM after C++ changes
cd apps/web && pnpm build:wasm

# Native WASM build for C++ tests
cd packages/engine
mkdir -p build_native && cd build_native
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

---

## 7. Test Commands

### C++ (CTest)

```bash
cd packages/engine/build_native
ctest --output-on-failure

# Specific
ctest -R TextLayout --output-on-failure

# Verbose
ctest -V
```

### Frontend (Vitest)

```bash
cd apps/web

# Run all
npx vitest run

# Watch mode
npx vitest

# Specific file
npx vitest run tests/engineRuntime.test.ts

# Coverage
npx vitest run --coverage
```

---

## 8. Pre-Commit Checklist

```bash
# 1. Full build must pass
make fbuild

# 2. C++ tests must pass
cd packages/engine/build_native && ctest --output-on-failure

# 3. Frontend tests must pass
cd apps/web && npx vitest run

# 4. TypeScript check
cd apps/web && npx tsc --noEmit

# 5. Linting
cd apps/web && npx eslint src/
```

---

## 9. Code Review Checklist

### For C++ Changes

- [ ] Memory: no leaks, no dangling pointers
- [ ] Performance: no allocations in hot paths
- [ ] POD: shared structs are POD
- [ ] Bounds: array access validated
- [ ] Thread safety: if applicable

### For Frontend Changes

- [ ] No shadow state of Engine data
- [ ] Specific selectors (not entire object)
- [ ] No unjustified `any`
- [ ] No console.log in production
- [ ] Callbacks memoized when necessary

### For Both

- [ ] Tests added/updated
- [ ] No breaking changes without migration
- [ ] Performance did not regress

---

## 10. Performance Profiling

### C++ (Native)

```bash
# Build with debug symbols
cmake .. -DCMAKE_BUILD_TYPE=RelWithDebInfo

# Profile with perf (Linux)
perf record ./cad_engine_tests
perf report
```

### Frontend

```javascript
// Chrome DevTools Performance tab
// Record interaction and analyze flame chart

// Specific
performance.mark("operation-start");
// ... operation
performance.mark("operation-end");
performance.measure("operation", "operation-start", "operation-end");
```

### WebGL

- Chrome: `about:tracing`
- Firefox: Shader debugger

---

## 11. Common Pitfalls

| Pitfall             | How to Avoid                            |
| ------------------- | --------------------------------------- |
| Excessive re-render | Specific selectors, memoization         |
| Memory leak in WASM | Manage Embind object lifecycle          |
| Slow picking        | Use spatial index, don't iterate in JS  |
| Transform jitter    | Don't update React state in pointermove |
| Slow text layout    | Batch edits, dirty flag                 |

---

## 12. Troubleshooting

### WASM Build Fails

```bash
# Clean and rebuild
cd apps/web
rm -rf node_modules/.cache
pnpm build:wasm
```

### C++ Tests Fail

```bash
# Clean rebuild
cd packages/engine
rm -rf build_native
mkdir build_native && cd build_native
cmake ..
make -j$(nproc)
ctest
```

### Frontend Not Reloading

```bash
# Clear Vite cache
cd apps/web
rm -rf node_modules/.vite
pnpm dev
```
