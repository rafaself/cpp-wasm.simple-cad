# Frontend Patterns

> Padrões permitidos e proibidos para código React/TypeScript.

---

## 1. Princípio Fundamental

**O Engine C++ é a única fonte de verdade para dados do documento.**

React/Zustand gerenciam apenas:

- Ferramenta ativa (`activeTool`)
- Estado de viewport (`viewTransform`)
- Preferências do usuário (`useSettingsStore`)
- Estado de UI (modais abertos, loading, etc.)

---

## 2. Stores Zustand

### `useUIStore` — Estado de UI Volátil

```typescript
// ✅ Permitido
activeTool: ToolType;
viewTransform: { x, y, scale };
isSettingsModalOpen: boolean;
mousePos: Point | null;

// ❌ Proibido
shapes: Shape[];           // Engine é a autoridade
selectedIds: number[];     // Use runtime.getSelectedIds()
textContent: string;       // Use runtime.getTextContentMeta()
```

### `useSettingsStore` — Preferências Persistentes

```typescript
// ✅ Configurações
grid: { size, color, showDots };
snap: { enabled, endpoint, midpoint, ... };
toolDefaults: { strokeColor, fillColor, ... };
```

---

## 3. Padrões de Componentes

### Componente de Interação (EngineInteractionLayer)

```typescript
// ✅ Correto: delegar para Engine
const handlePointerDown = (evt) => {
  const pick = runtime.pick(worldX, worldY, tolerance);
  if (pick.id) {
    runtime.beginTransform([pick.id], TransformMode.Move, ...);
  }
};

// ❌ Errado: manter estado local
const [selectedShapes, setSelectedShapes] = useState([]);
```

### Componente de Exibição (Toolbar, Ribbon)

```typescript
// ✅ Correto: ler do Engine sob demanda
const snapshot = runtime.getTextStyleSnapshot(textId);
return <FontSelector value={snapshot.fontId} />;

// ❌ Errado: cache local
const [fontId, setFontId] = useState(defaultFont);
```

---

## 4. Fluxo de Criação de Entidades

```typescript
// 1. Gerar ID
const entityId = runtime.allocateEntityId();

// 2. Enviar command
runtime.apply([{
  op: CommandOp.UpsertRect,
  id: entityId,
  rect: { x, y, w, h, fillR, fillG, fillB, fillA, ... }
}]);

// 3. (Opcional) Selecionar após criar
runtime.selectEntity(entityId, SelectionMode.Replace, 0);
```

---

## 5. Fluxo de Transformação

```typescript
// No pointerdown
if (pick.subTarget === PickSubTarget.Body) {
  runtime.beginTransform(
    selectedIds,
    TransformMode.Move,
    0,
    -1,
    worldX,
    worldY
  );
}

// No pointermove (NÃO atualizar React state!)
runtime.updateTransform(worldX, worldY);

// No pointerup
runtime.commitTransform();
// Engine emite eventos, React re-renderiza automaticamente
```

---

## 6. Evitar Re-renders Desnecessários

### Seletores Específicos

```typescript
// ✅ Selecionar apenas o necessário
const activeTool = useUIStore((s) => s.activeTool);

// ❌ Evitar selecionar objeto inteiro
const state = useUIStore();
```

### Memoização

```typescript
// ✅ Callbacks estáveis
const handleClick = useCallback(() => { ... }, [dependency]);

// ✅ Valores derivados
const computed = useMemo(() => expensiveComputation(data), [data]);
```

---

## 7. TypeScript

- Respeitar configuração do projeto (`tsconfig.json`)
- Evitar `any` — usar tipos específicos ou `unknown`
- Interfaces com prefixo `I` quando convenção do projeto
- IDs: usar `crypto.randomUUID()` ou `runtime.allocateEntityId()`

---

## 8. Conversões de Coordenadas

```typescript
// Screen → World
const worldX = (screenX - viewTransform.x) / viewTransform.scale;
const worldY = (screenY - viewTransform.y) / viewTransform.scale;

// World → Screen
const screenX = worldX * viewTransform.scale + viewTransform.x;
const screenY = worldY * viewTransform.scale + viewTransform.y;
```

**Nota:** O sistema de coordenadas usa Y-Up (positivo para cima).

---

## 9. Testes

```bash
# Rodar testes
cd frontend && npx vitest run

# Watch mode
cd frontend && npx vitest
```

- Testes devem ser determinísticos
- Evitar mocks globais
- Preferir testes de contrato sobre testes de implementação
