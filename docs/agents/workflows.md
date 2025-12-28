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

1. **C++ Types** (`cpp/engine/types.h`)

   ```cpp
   struct FooRec {
       uint32_t id;
       // ... POD fields
   };
   ```

2. **C++ Command** (`cpp/engine/commands.h`)

   ```cpp
   enum class CommandOp : uint8_t {
       // ...
       UpsertFoo = XX,
   };
   ```

3. **C++ Storage** (`cpp/engine/engine.h`)

   ```cpp
   std::vector<FooRec> foos_;
   // ... CRUD methods
   ```

4. **C++ Implementation** (`cpp/engine/entity_manager.cpp`)

   - Implement upsert, delete
   - Add to draw order

5. **C++ Picking** (`cpp/engine/pick_system.cpp`)

   - Add hit test for new primitive

6. **C++ Snapshot** (`cpp/engine/snapshot.cpp`)

   - Serialize/deserialize

7. **C++ Bindings** (`cpp/engine/bindings.cpp`)

   - Expose via Embind

8. **C++ Tests** (`cpp/tests/`)

   - Unit tests for CRUD and picking

9. **Frontend Command** (`frontend/engine/core/commandBuffer.ts`)

   ```typescript
   export interface FooPayload { ... }
   // Add case in payloadByteLength and encodeCommandBuffer
   ```

10. **Frontend Tool** (`frontend/features/editor/hooks/useDraftHandler.ts`)

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

1. **C++** (`cpp/engine/engine.h`)

   ```cpp
   enum class TransformMode : uint8_t {
       // ...
       NewMode = X,
   };
   ```

2. **C++ Logic** (`cpp/engine/engine.cpp`)

   - Implement in `updateTransform()`
   - Implement in `commitTransform()`

3. **Frontend Mapping** (`frontend/engine/core/interactionSession.ts`)

   - Add constant

4. **Frontend Trigger** (`EngineInteractionLayer.tsx`)

   - Add condition to start

5. **Tests**

---

## 5. Debug Workflow

### Engine State

```typescript
// Stats
const stats = runtime.getEngineStats();
console.log("Entities:", stats.rectCount, stats.lineCount, stats.polylineCount);

// Buffers
const triMeta = runtime.getTriangleBufferMeta();
console.log("Triangle vertices:", triMeta.vertexCount);
```

### Picking Debug

```typescript
const pick = runtime.pick(worldX, worldY, tolerance);
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
runtime.pick(x, y, tolerance);
console.log("Pick time:", performance.now() - t0, "ms");
```

---

## 6. Build Commands

```bash
# Full build (WASM + Frontend)
make fbuild

# Frontend dev mode (hot reload)
cd frontend && pnpm dev

# Rebuild WASM after C++ changes
cd frontend && pnpm build:wasm

# Native WASM build for C++ tests
cd cpp
mkdir -p build_native && cd build_native
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

---

## 7. Test Commands

### C++ (CTest)

```bash
cd cpp/build_native
ctest --output-on-failure

# Specific
ctest -R TextLayout --output-on-failure

# Verbose
ctest -V
```

### Frontend (Vitest)

```bash
cd frontend

# Run all
npx vitest run

# Watch mode
npx vitest

# Specific file
npx vitest run src/engine/core/commandBuffer.test.ts

# Coverage
npx vitest run --coverage
```

---

## 8. Pre-Commit Checklist

```bash
# 1. Full build must pass
make fbuild

# 2. C++ tests must pass
cd cpp/build_native && ctest --output-on-failure

# 3. Frontend tests must pass
cd frontend && npx vitest run

# 4. TypeScript check
cd frontend && npx tsc --noEmit

# 5. Linting
cd frontend && npx eslint src/
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
cd frontend
rm -rf node_modules/.cache
pnpm build:wasm
```

### C++ Tests Fail

```bash
# Clean rebuild
cd cpp
rm -rf build_native
mkdir build_native && cd build_native
cmake ..
make -j$(nproc)
ctest
```

### Frontend Not Reloading

```bash
# Clear Vite cache
cd frontend
rm -rf node_modules/.vite
pnpm dev
```
