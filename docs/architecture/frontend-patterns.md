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
  selectedIds: number[];        // Use runtime.getSelectedIds()
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
  const selectedIds = runtime.getSelectedIds();

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
    const world = screenToWorld(evt.clientX, evt.clientY, viewTransform);
    const pick = runtime.pick(world.x, world.y, TOLERANCE);

    if (pick.id !== 0) {
      // Engine decides selection
      runtime.selectEntity(pick.id, SelectionMode.Replace, modifiers);
      // Engine starts transformation
      runtime.beginTransform(
        [pick.id],
        TransformMode.Move,
        0,
        -1,
        world.x,
        world.y
      );
    }
  },
  [viewTransform]
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
runtime.beginTransform(ids, mode, specificId, vertexIndex, startX, startY);
setDragActive(true); // Only state update

// PointerMove - NO setState!
const handlePointerMove = (evt) => {
  if (!dragActive) return;
  const world = screenToWorld(evt.clientX, evt.clientY, viewTransform);
  runtime.updateTransform(world.x, world.y);
  // Engine modifies entities, WebGL re-renders
  // React does NOT re-render
};

// PointerUp
runtime.commitTransform();
setDragActive(false);
```

---

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
runtime.updateTransform(world.x, world.y);

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

## 8. Coordinate Systems

```typescript
// Coordinate system: Y-Up (mathematical)
// Screen: (0,0) top-left, Y grows downward
// World: (0,0) center, Y grows upward

// Screen → World
const worldX = (screenX - viewTransform.x) / viewTransform.scale;
const worldY = -(screenY - viewTransform.y) / viewTransform.scale; // Note: negative

// World → Screen
const screenX = worldX * viewTransform.scale + viewTransform.x;
const screenY = -worldY * viewTransform.scale + viewTransform.y;
```

---

## 9. Component Architecture

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

## 10. TypeScript Standards

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

## 11. Internationalization (i18n)

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

## 12. Performance Monitoring

```typescript
// Dev-only performance marks
if (import.meta.env.DEV) {
  performance.mark("pick-start");
  const result = runtime.pick(x, y, tolerance);
  performance.mark("pick-end");
  performance.measure("pick", "pick-start", "pick-end");
}
```

---

## 13. Error Boundaries

```typescript
// Wrap critical components
<ErrorBoundary fallback={<CanvasError />}>
  <EngineInteractionLayer />
</ErrorBoundary>
```

---

## 14. Testing

```bash
cd frontend && npx vitest run
```

### Rules

- Tests must be deterministic
- Mock Engine only when necessary
- Prefer integration tests over unit tests for interactions
- Snapshot tests for stable UI