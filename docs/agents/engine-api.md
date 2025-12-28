# Engine API Reference

> Referência da API do Engine C++ para desenvolvimento de features.

---

## 1. Entidades Suportadas

| Tipo     | CommandOp        | Descrição                   |
| -------- | ---------------- | --------------------------- |
| Rect     | `UpsertRect`     | Retângulo com fill/stroke   |
| Line     | `UpsertLine`     | Linha simples               |
| Circle   | `UpsertCircle`   | Elipse com rotação e escala |
| Polygon  | `UpsertPolygon`  | Polígono regular (N lados)  |
| Polyline | `UpsertPolyline` | Linha com múltiplos pontos  |
| Arrow    | `UpsertArrow`    | Linha com ponta de seta     |
| Text     | `UpsertText`     | Texto com rich formatting   |

---

## 2. Métodos do EngineRuntime

### Ciclo de Vida

```typescript
EngineRuntime.create(): Promise<EngineRuntime>  // Inicializa WASM
runtime.clear(): void                            // Limpa documento
```

### Commands

```typescript
runtime.apply(commands: EngineCommand[]): void   // Envia batch de comandos
```

### Queries

```typescript
runtime.pick(x, y, tolerance): PickResult        // Hit test em coordenadas world
runtime.getEntityAabb(id): EntityAabb            // Bounding box de entidade
runtime.getSelectedIds(): Uint32Array            // IDs selecionados
runtime.getSelectionGeneration(): number         // Versão da seleção
```

### Seleção

```typescript
runtime.selectEntity(id, mode, modifiers): void  // Seleciona entidade
runtime.clearSelection(): void                   // Limpa seleção
runtime.queryMarquee(x0, y0, x1, y1, mode): void // Seleção por área
```

### Transformações Interativas

```typescript
runtime.beginTransform(ids, mode, specificId, vertexIndex, startX, startY): void
runtime.updateTransform(worldX, worldY): void
runtime.commitTransform(): CommitResult | null
runtime.cancelTransform(): void
runtime.isInteractionActive(): boolean
```

### Histórico

```typescript
runtime.undo(): void
runtime.redo(): void
runtime.canUndo(): boolean
runtime.canRedo(): boolean
runtime.getHistoryMeta(): HistoryMeta
```

### Serialização

```typescript
runtime.saveSnapshotBytes(): Uint8Array          // Exporta documento
runtime.loadSnapshotBytes(bytes): void           // Importa documento
```

### Snapping

```typescript
runtime.setSnapOptions(enabled, gridEnabled, gridSize): void
runtime.getSnappedPoint(x, y): { x, y }
```

---

## 3. Sistema de Texto

### Criar Texto

```typescript
// Via TextTool
textTool.handleClick(worldX, worldY); // AutoWidth
textTool.handleDrag(x0, y0, x1, y1); // FixedWidth
```

### Editar Texto

```typescript
textTool.handleInputDelta(delta: TextInputDelta);  // Inserção/deleção
textTool.applyTextAlign(align: TextAlign);         // Alinhamento
textTool.applyFontIdToText(textId, fontId);        // Fonte
```

### Queries de Texto

```typescript
runtime.getTextContentMeta(textId): TextContentMeta  // Conteúdo UTF-8
runtime.getTextBounds(textId): TextBoundsResult      // Dimensões
runtime.getTextCaretPosition(textId, charIndex)      // Posição do caret
runtime.getTextStyleSnapshot(textId)                 // Estado de estilo
```

---

## 4. Pick System

### PickResult

```typescript
interface PickResult {
  id: number; // Entity ID (0 = miss)
  kind: PickEntityKind; // Rect, Circle, Line, Text, etc.
  subTarget: PickSubTarget; // Body, Edge, Vertex, ResizeHandle
  subIndex: number; // Índice do sub-elemento
  distance: number; // Distância ao hit point
  hitX: number; // Coordenada X do hit
  hitY: number; // Coordenada Y do hit
}
```

### PickSubTarget

- `Body` — Área principal da entidade
- `Edge` — Borda (para polylines)
- `Vertex` — Vértice arrastável
- `ResizeHandle` — Handle de redimensionamento
- `TextBody` / `TextCaret` — Áreas de texto

---

## 5. Transform Modes

| Mode         | Uso                          |
| ------------ | ---------------------------- |
| `Move`       | Mover entidades selecionadas |
| `VertexDrag` | Arrastar vértice específico  |
| `EdgeDrag`   | Arrastar borda               |
| `Resize`     | Redimensionar via handles    |

---

## 6. Events (Engine → JS)

```typescript
const { events } = runtime.pollEvents(100);
```

| EventType          | Quando dispara       |
| ------------------ | -------------------- |
| `DocChanged`       | Documento modificado |
| `EntityCreated`    | Nova entidade criada |
| `EntityChanged`    | Entidade modificada  |
| `EntityDeleted`    | Entidade removida    |
| `SelectionChanged` | Seleção alterada     |
| `HistoryChanged`   | Undo/redo executado  |
| `LayerChanged`     | Layer modificada     |

---

## 7. Commands Binários

Ver `frontend/engine/core/commandBuffer.ts` para lista completa de CommandOps e payloads.

Principais:

- `UpsertRect`, `UpsertLine`, `UpsertCircle`, `UpsertPolygon`, `UpsertArrow`, `UpsertPolyline`
- `UpsertText`, `InsertTextContent`, `DeleteTextContent`, `ApplyTextStyle`, `SetTextAlign`
- `DeleteEntity`, `DeleteText`
- `SetDrawOrder`, `SetViewScale`
