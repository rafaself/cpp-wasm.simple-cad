# Frontend Patterns (Strict)

> Mandatory patterns for high-performance React/TypeScript code.

---

## 1. Fundamental Principle

**React is a presentation layer. It is NOT a data store.**

```
DOCUMENT DATA  →  C++ Engine    (source of truth)
UI STATE       →  Zustand       (tool, viewport, preferences)
RENDERING      →  WebGL2        (stateless)
```

---

## 2. What Zustand Can Store

### ✅ ALLOWED

```typescript
// useUIStore.ts
interface UIState {
  // Tool state
  activeTool: ToolType; // Which tool is active

  // Viewport
  viewTransform: ViewTransform; // { x, y, scale }
  canvasSize: { width; height };
  mousePos: Point | null; // See Hot Path Rules for update policy

  // UI state
  isSettingsModalOpen: boolean;
  isLayerManagerOpen: boolean;

  // Interaction state (transient)
  engineInteractionActive: boolean;
  interactionDragActive: boolean;
}

// useSettingsStore.ts
interface SettingsState {
  grid: GridSettings;
  snap: SnapSettings;
  toolDefaults: ToolDefaults; // Default colors, etc.
  featureFlags: FeatureFlags;
}
```

### ❌ FORBIDDEN (Architectural Violation)

```typescript
// NEVER do this:
interface BadState {
  shapes: Shape[];              // Engine is authority
  selectedIds: number[];        // Use runtime.getSelectionIds()
  entityProperties: Map<...>;   // Query from Engine
  textContent: string;          // Engine is authority
  caretIndex: number;           // Engine is authority
}
```

---

## 3. Selectors (Performance Critical)

### ✅ CORRECT: Specific Selectors

```typescript
// Each component selects ONLY what it needs
const activeTool = useUIStore((s) => s.activeTool);
const scale = useUIStore((s) => s.viewTransform.scale);

// Memoized selector for derived data
const gridVisible = useSettingsStore(
  useCallback((s) => s.grid.showDots || s.grid.showLines, [])
);
```

### ❌ WRONG: Select Entire Object

```typescript
// Causes re-render on ANY store change
const state = useUIStore();
```

---

## 4. Pattern: Engine Queries

### ✅ CORRECT: Query on Demand

```typescript
function PropertyPanel() {
  const selectedIds = runtime.getSelectionIds();

  // Query properties at render time
  const properties = useMemo(() => {
    if (selectedIds.length === 0) return null;
    return runtime.getEntityAabb(selectedIds[0]);
  }, [selectedIds /* + generation for invalidation */]);

  return <Panel data={properties} />;
}
```

### ❌ WRONG: Cache in State

```typescript
// Shadow state - FORBIDDEN
const [properties, setProperties] = useState(null);
useEffect(() => {
  setProperties(runtime.getEntityAabb(id));
}, [id]);
```

---

## 5. Pattern: Event Handling

### ✅ CORRECT: Dispatch to Engine

```typescript
const handlePointerDown = useCallback(
  (evt: React.PointerEvent) => {
    // Convert using runtime viewport (no local math)
    screen.x = evt.clientX - rect.left;
    screen.y = evt.clientY - rect.top;
    runtime.viewport.screenToWorldWithTransformInto(screen, viewTransform, world);
    const tolerance = runtime.viewport.getPickingToleranceWithTransform(viewTransform);
    const pick = runtime.pickExSmart(world.x, world.y, tolerance, 0xff);

    if (pick.id !== 0) {
      // Engine decides selection
      runtime.selectByPick(pick, modifiers);
      // Engine starts transformation
      runtime.beginTransform(
        [pick.id],
        TransformMode.Move,
        0,
        -1,
        evt.clientX,
        evt.clientY,
        viewTransform.x,
        viewTransform.y,
        viewTransform.scale,
        canvasSize.width,
        canvasSize.height,
        modifiers
      );
    }
  },
  [viewTransform, canvasSize]
);
```

### ❌ WRONG: Local State

```typescript
// Keeping local selection state - FORBIDDEN
const [selected, setSelected] = useState<number[]>([]);
const handleClick = (id) => setSelected([id]);
```

---

## 6. Pattern: Interactive Transform

### ✅ CORRECT: Zero React Updates During Drag

```typescript
// PointerDown
runtime.beginTransform(
  ids,
  mode,
  specificId,
  vertexIndex,
  screenX,
  screenY,
  viewX,
  viewY,
  viewScale,
  viewWidth,
  viewHeight,
  modifiers
);
setDragActive(true); // Only state update

// PointerMove - NO setState!
const handlePointerMove = (evt) => {
  if (!dragActive) return;
  runtime.updateTransform(
    evt.clientX,
    evt.clientY,
    viewTransform.x,
    viewTransform.y,
    viewTransform.scale,
    canvasSize.width,
    canvasSize.height,
    modifiers
  );
  // Engine modifies entities, WebGL re-renders
  // React does NOT re-render
};

// PointerUp
runtime.commitTransform();
setDragActive(false);
```

---

## 7. Interaction Core (Required)

All pointer/key input routing is centralized in `InteractionCore`:

- `apps/web/features/editor/interactions/interactionCore.ts` owns:
  - Input pipeline (pointer/key/blur)
  - Tool handler lifecycle (enter/leave/transition)
  - Context reuse (no allocations on pointermove)
- `useInteractionManager` is a thin hook around `InteractionCore`.
- Handlers are **coordinators only**; geometry, snapping, tolerances, and transforms live in Atlas via runtime facades.

If a handler needs a world point:
- Use `runtime.viewport.screenToWorldWithTransformInto(...)` and reuse preallocated points.
- Do not import viewport math helpers into handlers.

## 7. Hot Path Rules

### Forbidden in pointermove / drag

```typescript
// ❌ Object creation
const pos = { x: evt.clientX, y: evt.clientY };

// ❌ Array operations
const newArray = [...oldArray, item];

// ❌ String operations
const key = `entity-${id}`;

// ❌ Closure creation
items.map((item) => () => handle(item));

// ❌ Direct Store Update (High Frequency)
setMousePos(pos); // Causes re-renders at 120Hz+
```

### Allowed

```typescript
// ✅ Reuse object
reusablePos.x = evt.clientX;
reusablePos.y = evt.clientY;

// ✅ Direct mutation (when safe)
runtime.updateTransform(
  evt.clientX,
  evt.clientY,
  viewTransform.x,
  viewTransform.y,
  viewTransform.scale,
  canvasSize.width,
  canvasSize.height,
  modifiers
);

// ✅ Typed arrays
const ids = new Uint32Array([id1, id2]);

// ✅ Throttled Store Update (RAF)
mousePosRef.current = pos;
if (!rafPending) {
  requestAnimationFrame(() => {
    setMousePos(mousePosRef.current);
    rafPending = false;
  });
}
```

**Policy:**
- `mousePos` (screen/world) must live in a **ref** within the interaction layer.
- UI components consuming `mousePos` (e.g., Status Bar) must accept throttled updates (max 60Hz via RAF).
- **Prohibited:** Calling `setState` or Zustand setters directly inside `pointermove` handlers without throttling.

---

## 8. Integration Transactions (Atlas + Domain)

```typescript
const integration = new IntegrationRuntime(runtime, domainRuntime);

integration.runTransaction('set-elevation', ({ atlas, domain }) => {
  atlas.setEntityGeomZ(entityId, geomZ);
  domain.setSemanticHeight(componentId, semanticHeight);
});
```

**Rules:**
- Use a single integration transaction for any action that touches Atlas + domain.
- Keep geomZ (Atlas) and semantic height (domain) separate and explicit.
- Do not run integration transactions on hot paths (pointermove).

---

## 9. Coordinate Systems

```typescript
// Coordinate system: +Y Down (screen + world)
// Screen: (0,0) top-left, Y grows downward
// World: (0,0) center, Y grows downward

// Screen -> World
const worldX = (screenX - viewTransform.x) / viewTransform.scale;
const worldY = (screenY - viewTransform.y) / viewTransform.scale;

// World -> Screen
const screenX = worldX * viewTransform.scale + viewTransform.x;
const screenY = worldY * viewTransform.scale + viewTransform.y;
```

---

## 10. Component Architecture

### Interaction Layer (EngineInteractionLayer)

```typescript
// Responsibilities:
// - Capture mouse/touch events
// - Convert coordinates
// - Dispatch to Engine
// - Does NOT maintain entity state
```

### Property Panels

```typescript
// Responsibilities:
// - Query Engine for current data
// - Render UI
// - Dispatch commands for modifications
// - Does NOT cache data
```

### Toolbars/Ribbons

```typescript
// Responsibilities:
// - Show active tool state
// - Dispatch setTool() to Zustand
// - Dispatch commands to Engine
```

---

## 11. TypeScript Standards

### Mandatory

```typescript
// Strict mode
"strict": true

// No any
// eslint: @typescript-eslint/no-explicit-any

// Prefer unknown + type guards
function handle(data: unknown) {
  if (isPickResult(data)) { ... }
}

// Typed interfaces
interface RectPayload {
  x: number;
  y: number;
  w: number;
  h: number;
  // ... all fields explicit
}
```

### IDs

```typescript
// For Engine entities
const entityId = runtime.allocateEntityId();

// For React UI elements
const uiId = crypto.randomUUID();

// NEVER use Date.now() or Math.random() for IDs
```

---

## 12. Internationalization (i18n)

### Current State

- **UI display text**: Portuguese (pt-BR)
- **Code internals**: English

### Pattern for Extractable Strings

```typescript
// ✅ CORRECT: Extractable for future i18n
const LABELS = {
  save: 'Salvar',
  undo: 'Desfazer',
  redo: 'Refazer',
  textTool: 'Ferramenta de Texto',
  selectTool: 'Ferramenta de Seleção',
};

// Usage
<button>{LABELS.save}</button>

// ❌ WRONG: Hardcoded inline
<button>Salvar</button>
```

---

## 13. Performance Monitoring

```typescript
// Dev-only performance marks
if (import.meta.env.DEV) {
  performance.mark("pick-start");
  const result = runtime.pickEx(x, y, tolerance, 0xff);
  performance.mark("pick-end");
  performance.measure("pick", "pick-start", "pick-end");
}
```

---

## 14. Error Boundaries

```typescript
// Wrap critical components
<ErrorBoundary fallback={<CanvasError />}>
  <EngineInteractionLayer />
</ErrorBoundary>
```

---

## 15. Testing

```bash
cd apps/web && npx vitest run
```

### Rules

- Tests must be deterministic
- Mock Engine only when necessary
- Prefer integration tests over unit tests for interactions
- Snapshot tests for stable UI
