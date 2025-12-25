# Plano de Refatoração de Pontos Críticos

**Data**: 2025-12-25  
**Status**: Planejamento  
**Prioridade Geral**: Alta

---

## Sumário Executivo

Este documento estabelece um plano incremental e seguro para resolver os 4 pontos críticos identificados na avaliação de codebase:

1. **engine.cpp** — Monólito C++ (~2000 linhas)
2. **EngineInteractionLayer.tsx** — God Object React (~960 linhas)
3. **TextTool.ts** — Classe muito grande (~1290 linhas)
4. **Sistema de IDs fragmentado** — Mapeamento string ↔ number disperso

### Princípios do Refactoring

- ✅ **Incremental**: Cada fase é independente e pode ser mergeada separadamente
- ✅ **Sem breaking changes**: Comportamento externo permanece idêntico
- ✅ **Testável**: Cada mudança mantém ou melhora cobertura de testes
- ✅ **Reversível**: Commits atômicos permitem rollback se necessário

---

## Fase 1: Decomposição de `engine.cpp` (C++)

**Duração estimada**: 3-4 dias  
**Risco**: Baixo (refatoração interna, API externa inalterada)  
**Pré-requisitos**: Testes C++ passando

### 1.1 Objetivo

Separar o arquivo `cpp/engine.cpp` (~2000 linhas) em módulos coesos mantendo a API pública em `CadEngine` inalterada.

### 1.2 Nova Estrutura Proposta

```
cpp/
├── engine.cpp                    → Composição principal (reduzido para ~200 linhas)
├── engine/
│   ├── engine.h                  → Header público (já existe)
│   ├── entity_manager.cpp        → CRUD de entidades (rects, lines, polylines, etc.)
│   ├── entity_manager.h          → Declarações
│   ├── command_dispatcher.cpp    → cad_command_callback e parsing
│   ├── command_dispatcher.h      → Declarações
│   ├── render_buffer_builder.cpp → rebuildRenderBuffers, tessellation calls
│   ├── render_buffer_builder.h   → Declarações
│   └── snapshot_manager.cpp      → rebuildSnapshotBytes (já tem snapshot.cpp)
```

### 1.3 Passos de Implementação

#### Passo 1.3.1: Criar `entity_manager.cpp/h`

**Escopo**: Extrair todas as funções `upsert*` e `deleteEntity`

```cpp
// entity_manager.h
#pragma once
#include "engine/types.h"
#include <cstdint>
#include <vector>
#include <unordered_map>

namespace engine {

class EntityManager {
public:
    // CRUD operations
    void upsertRect(std::uint32_t id, float x, float y, float w, float h,
                    float r, float g, float b, float a,
                    float sr, float sg, float sb, float sa,
                    float strokeEnabled, float strokeWidthPx);
    void upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1,
                    float r, float g, float b, float a, float enabled, float strokeWidthPx);
    // ... demais upserts

    void deleteEntity(std::uint32_t id);

    // Accessors
    std::vector<RectRec>& rects() { return rects_; }
    std::vector<LineRec>& lines() { return lines_; }
    // ... demais accessors

    void clear();
    void reserve(std::uint32_t maxRects, std::uint32_t maxLines,
                 std::uint32_t maxPolylines, std::uint32_t maxPoints);

    bool isDirty() const { return dirty_; }
    void clearDirty() { dirty_ = false; }

private:
    std::vector<RectRec> rects_;
    std::vector<LineRec> lines_;
    std::vector<PolyRec> polylines_;
    std::vector<Point2> points_;
    std::vector<CircleRec> circles_;
    std::vector<PolygonRec> polygons_;
    std::vector<ArrowRec> arrows_;
    std::vector<SymbolRec> symbols_;
    std::vector<NodeRec> nodes_;
    std::vector<ConduitRec> conduits_;

    std::unordered_map<std::uint32_t, EntityRef> entities_;
    std::vector<std::uint32_t> drawOrderIds_;

    bool dirty_ = true;
};

} // namespace engine
```

**Verificação**:

- [ ] Compilar WASM
- [ ] Rodar todos os testes C++ existentes
- [ ] Verificar funcionamento no browser

#### Passo 1.3.2: Criar `command_dispatcher.cpp/h`

**Escopo**: Extrair `cad_command_callback` e lógica de parsing

```cpp
// command_dispatcher.h
#pragma once
#include "engine/types.h"
#include "engine/entity_manager.h"
#include "engine/text/text_store.h"

namespace engine {

class CommandDispatcher {
public:
    CommandDispatcher(EntityManager& entities, text::TextStore& textStore);

    // Main callback for command buffer processing
    EngineError dispatch(std::uint32_t op, std::uint32_t id,
                         const std::uint8_t* payload, std::uint32_t payloadByteCount);

private:
    EntityManager& entities_;
    text::TextStore& textStore_;

    // Per-command handlers
    EngineError handleClearAll();
    EngineError handleDeleteEntity(std::uint32_t id);
    EngineError handleUpsertRect(std::uint32_t id, const std::uint8_t* payload, std::uint32_t size);
    EngineError handleUpsertLine(std::uint32_t id, const std::uint8_t* payload, std::uint32_t size);
    // ... demais handlers
};

} // namespace engine
```

**Verificação**:

- [ ] Testes de comandos passando
- [ ] Verificar aplicação de comandos no browser

#### Passo 1.3.3: Criar `render_buffer_builder.cpp/h`

**Escopo**: Extrair `rebuildRenderBuffers`, `rebuildTextQuadBuffer`, helpers de vértices

```cpp
// render_buffer_builder.h
#pragma once
#include "engine/entity_manager.h"
#include "engine/text/text_layout.h"
#include <vector>

namespace engine {

class RenderBufferBuilder {
public:
    RenderBufferBuilder(EntityManager& entities, text::TextLayoutEngine& textLayout);

    void rebuild();
    void rebuildTextQuads();

    const std::vector<float>& triangleVertices() const { return triangleVertices_; }
    const std::vector<float>& lineVertices() const { return lineVertices_; }
    const std::vector<float>& textQuadVertices() const { return textQuadVertices_; }

    std::uint32_t generation() const { return generation_; }

private:
    EntityManager& entities_;
    text::TextLayoutEngine& textLayout_;

    std::vector<float> triangleVertices_;
    std::vector<float> lineVertices_;
    std::vector<float> textQuadVertices_;

    std::uint32_t generation_ = 0;

    void pushVertex(float x, float y, float z, float r, float g, float b, float a,
                    std::vector<float>& target);
    void addRect(const RectRec& rect);
    void addRectOutline(const RectRec& rect);
    void addLineSegment(const LineRec& line);
};

} // namespace engine
```

**Verificação**:

- [ ] Rendering visual idêntico ao anterior
- [ ] Testes de render passando

#### Passo 1.3.4: Refatorar `CadEngine` como Compositor

**Escopo**: `CadEngine` passa a delegar para os módulos

```cpp
// engine.cpp (refatorado, ~200 linhas)
#include "engine/engine.h"
#include "engine/entity_manager.h"
#include "engine/command_dispatcher.h"
#include "engine/render_buffer_builder.h"

CadEngine::CadEngine()
    : entityManager_(std::make_unique<engine::EntityManager>())
    , commandDispatcher_(std::make_unique<engine::CommandDispatcher>(*entityManager_, textStore_))
    , renderBuilder_(std::make_unique<engine::RenderBufferBuilder>(*entityManager_, textLayout_))
{
    // ... inicialização
}

void CadEngine::applyCommandBuffer(std::uintptr_t ptr, std::uint32_t byteCount) {
    const std::uint8_t* src = reinterpret_cast<const std::uint8_t*>(ptr);
    EngineError err = engine::parseCommandBuffer(src, byteCount,
        [this](std::uint32_t op, std::uint32_t id, const std::uint8_t* p, std::uint32_t s) {
            return commandDispatcher_->dispatch(op, id, p, s);
        });
    // ...
}

// Delegates to modules
void CadEngine::upsertRect(...) { entityManager_->upsertRect(...); }
BufferMeta CadEngine::getPositionBufferMeta() {
    if (entityManager_->isDirty()) renderBuilder_->rebuild();
    return buildMeta(renderBuilder_->triangleVertices(), 7);
}
```

### 1.4 Critérios de Sucesso da Fase 1

- [ ] `engine.cpp` reduzido de ~2000 para ~200 linhas
- [ ] Todos os testes C++ passando sem modificações
- [ ] Build WASM funcional
- [ ] Comportamento idêntico no browser
- [ ] Nenhuma alteração em código JS/TS

---

## Fase 2: Decomposição de `EngineInteractionLayer.tsx`

**Duração estimada**: 4-5 dias  
**Risco**: Médio (componente central de interação)  
**Pré-requisitos**: Fase 1 completa (opcional) ou independente

### 2.1 Objetivo

Decompor `EngineInteractionLayer.tsx` (~960 linhas) em hooks composáveis e componentes menores, mantendo o comportamento idêntico.

### 2.2 Nova Estrutura Proposta

```
frontend/features/editor/
├── components/
│   └── EngineInteractionLayer.tsx  → Compositor (~150 linhas)
├── hooks/
│   ├── interaction/
│   │   ├── usePointerState.ts      → Estado de pointer tracking
│   │   ├── usePanZoom.ts           → Pan e zoom handling
│   │   ├── useSelectionInteraction.ts → Seleção e multi-seleção
│   │   ├── useShapeDrawing.ts      → Criação de shapes (rect, line, etc.)
│   │   ├── useSymbolPlacement.ts   → Colocação de símbolos elétricos
│   │   └── useKeyboardShortcuts.ts → Atalhos de teclado
│   └── (hooks existentes)
└── utils/
    └── interactionHelpers.ts       → Funções puras (toWorldPoint, snapToGrid, etc.)
```

### 2.3 Passos de Implementação

#### Passo 2.3.1: Extrair Funções Utilitárias

**Arquivo**: `frontend/features/editor/utils/interactionHelpers.ts`

```typescript
// interactionHelpers.ts
import type { ViewTransform, Point } from "@/types";

/**
 * Convert screen coordinates to world coordinates.
 */
export function toWorldPoint(
  screenX: number,
  screenY: number,
  viewTransform: ViewTransform
): Point {
  const scale = viewTransform.scale || 1;
  return {
    x: (screenX - viewTransform.x) / scale,
    y: -(screenY - viewTransform.y) / scale, // Y-Up conversion
  };
}

/**
 * Snap a point to the nearest grid intersection.
 */
export function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

/**
 * Determine if a movement qualifies as a drag (vs click).
 */
export function isDrag(dx: number, dy: number, threshold = 4): boolean {
  return Math.abs(dx) > threshold || Math.abs(dy) > threshold;
}

/**
 * Get cursor CSS for current tool.
 */
export function getCursorForTool(tool: string): string {
  switch (tool) {
    case "pan":
      return "grab";
    case "rect":
    case "line":
    case "polyline":
    case "text":
      return "crosshair";
    default:
      return "default";
  }
}

/**
 * Clamp tiny values to zero (for floating point stability).
 */
export function clampTiny(v: number, epsilon = 1e-9): number {
  return Math.abs(v) < epsilon ? 0 : v;
}
```

**Verificação**:

- [ ] Criar testes unitários para cada função
- [ ] Substituir implementações inline no componente original

#### Passo 2.3.2: Criar `usePointerState.ts`

**Escopo**: Gerenciamento de estado de pointer/mouse centralizado

```typescript
// usePointerState.ts
import { useRef, useCallback } from "react";
import { toWorldPoint } from "../utils/interactionHelpers";
import type { ViewTransform, Point } from "@/types";

export interface PointerState {
  isDown: boolean;
  downScreenPos: Point | null;
  downWorldPos: Point | null;
  currentScreenPos: Point | null;
  currentWorldPos: Point | null;
  button: number;
}

export function usePointerState(viewTransform: ViewTransform) {
  const stateRef = useRef<PointerState>({
    isDown: false,
    downScreenPos: null,
    downWorldPos: null,
    currentScreenPos: null,
    currentWorldPos: null,
    button: 0,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const screen = { x: e.clientX, y: e.clientY };
      const world = toWorldPoint(screen.x, screen.y, viewTransform);

      stateRef.current = {
        isDown: true,
        downScreenPos: screen,
        downWorldPos: world,
        currentScreenPos: screen,
        currentWorldPos: world,
        button: e.button,
      };
    },
    [viewTransform]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const screen = { x: e.clientX, y: e.clientY };
      const world = toWorldPoint(screen.x, screen.y, viewTransform);

      stateRef.current.currentScreenPos = screen;
      stateRef.current.currentWorldPos = world;
    },
    [viewTransform]
  );

  const handlePointerUp = useCallback(() => {
    stateRef.current.isDown = false;
  }, []);

  return {
    state: stateRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
```

#### Passo 2.3.3: Criar `usePanZoom.ts`

**Escopo**: Lógica isolada de pan e zoom

```typescript
// usePanZoom.ts
import { useCallback, useRef } from "react";
import { useUIStore } from "@/stores/useUIStore";

export function usePanZoom() {
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const setViewTransform = useUIStore((s) => s.setViewTransform);
  const viewTransform = useUIStore((s) => s.viewTransform);

  const beginPan = useCallback((screenX: number, screenY: number) => {
    panStartRef.current = { x: screenX, y: screenY };
  }, []);

  const updatePan = useCallback(
    (screenX: number, screenY: number) => {
      if (!panStartRef.current) return;

      const dx = screenX - panStartRef.current.x;
      const dy = screenY - panStartRef.current.y;

      setViewTransform({
        ...viewTransform,
        x: viewTransform.x + dx,
        y: viewTransform.y + dy,
      });

      panStartRef.current = { x: screenX, y: screenY };
    },
    [viewTransform, setViewTransform]
  );

  const endPan = useCallback(() => {
    panStartRef.current = null;
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent, centerX: number, centerY: number) => {
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(
        0.1,
        Math.min(10, viewTransform.scale * zoomFactor)
      );

      // Zoom centered on cursor
      const worldX = (centerX - viewTransform.x) / viewTransform.scale;
      const worldY = (centerY - viewTransform.y) / viewTransform.scale;

      setViewTransform({
        scale: newScale,
        x: centerX - worldX * newScale,
        y: centerY - worldY * newScale,
      });
    },
    [viewTransform, setViewTransform]
  );

  return {
    isPanning: panStartRef.current !== null,
    beginPan,
    updatePan,
    endPan,
    handleWheel,
  };
}
```

#### Passo 2.3.4: Criar `useSelectionInteraction.ts`

**Escopo**: Lógica de seleção, box selection, multi-select

```typescript
// useSelectionInteraction.ts
import { useCallback, useRef } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useDataStore } from "@/stores/useDataStore";
import type { Point } from "@/types";

interface SelectionBox {
  start: Point;
  end: Point;
}

export function useSelectionInteraction() {
  const boxRef = useRef<SelectionBox | null>(null);
  const selectedIds = useUIStore((s) => s.selectedShapeIds);
  const setSelectedIds = useUIStore((s) => s.setSelectedShapeIds);
  const shapes = useDataStore((s) => s.shapes);

  const selectAt = useCallback(
    (worldPoint: Point, additive: boolean) => {
      // Hit test logic...
      const hitId = pickShapeAt(worldPoint, shapes);

      if (!hitId) {
        if (!additive) setSelectedIds(new Set());
        return;
      }

      if (additive) {
        const next = new Set(selectedIds);
        if (next.has(hitId)) {
          next.delete(hitId);
        } else {
          next.add(hitId);
        }
        setSelectedIds(next);
      } else {
        setSelectedIds(new Set([hitId]));
      }
    },
    [shapes, selectedIds, setSelectedIds]
  );

  const beginBoxSelect = useCallback((start: Point) => {
    boxRef.current = { start, end: start };
  }, []);

  const updateBoxSelect = useCallback((end: Point) => {
    if (boxRef.current) {
      boxRef.current.end = end;
    }
  }, []);

  const finishBoxSelect = useCallback(
    (additive: boolean) => {
      if (!boxRef.current) return;

      const box = boxRef.current;
      const idsInBox = findShapesInBox(box, shapes);

      if (additive) {
        const next = new Set(selectedIds);
        idsInBox.forEach((id) => next.add(id));
        setSelectedIds(next);
      } else {
        setSelectedIds(new Set(idsInBox));
      }

      boxRef.current = null;
    },
    [shapes, selectedIds, setSelectedIds]
  );

  return {
    selectedIds,
    selectionBox: boxRef.current,
    selectAt,
    beginBoxSelect,
    updateBoxSelect,
    finishBoxSelect,
    clearSelection: () => setSelectedIds(new Set()),
  };
}
```

#### Passo 2.3.5: Criar `useShapeDrawing.ts`

**Escopo**: Criação de shapes (rect, line, polyline)

```typescript
// useShapeDrawing.ts
import { useCallback, useRef } from "react";
import { useDataStore } from "@/stores/useDataStore";
import { useUIStore } from "@/stores/useUIStore";
import type { Point, Shape } from "@/types";
import { snapToGrid } from "../utils/interactionHelpers";

interface DrawingState {
  shapeType: "rect" | "line" | "polyline" | "circle" | "polygon" | "arrow";
  startPoint: Point;
  currentPoint: Point;
  points: Point[]; // For polyline
}

export function useShapeDrawing() {
  const stateRef = useRef<DrawingState | null>(null);
  const upsertShape = useDataStore((s) => s.upsertShape);
  const gridSize = useSettingsStore((s) => s.gridSize);
  const snapEnabled = useSettingsStore((s) => s.snapToGrid);

  const beginDraw = useCallback(
    (shapeType: DrawingState["shapeType"], worldPoint: Point) => {
      const snapped = snapEnabled
        ? snapToGrid(worldPoint, gridSize)
        : worldPoint;
      stateRef.current = {
        shapeType,
        startPoint: snapped,
        currentPoint: snapped,
        points: [snapped],
      };
    },
    [gridSize, snapEnabled]
  );

  const updateDraw = useCallback(
    (worldPoint: Point) => {
      if (!stateRef.current) return;
      const snapped = snapEnabled
        ? snapToGrid(worldPoint, gridSize)
        : worldPoint;
      stateRef.current.currentPoint = snapped;
    },
    [gridSize, snapEnabled]
  );

  const finishDraw = useCallback((): string | null => {
    if (!stateRef.current) return null;

    const { shapeType, startPoint, currentPoint } = stateRef.current;
    const id = generateId();

    let shape: Partial<Shape>;

    switch (shapeType) {
      case "rect":
        shape = createRectShape(id, startPoint, currentPoint);
        break;
      case "line":
        shape = createLineShape(id, startPoint, currentPoint);
        break;
      // ... outros tipos
    }

    upsertShape(shape as Shape);
    stateRef.current = null;

    return id;
  }, [upsertShape]);

  const cancelDraw = useCallback(() => {
    stateRef.current = null;
  }, []);

  return {
    isDrawing: stateRef.current !== null,
    drawingState: stateRef.current,
    beginDraw,
    updateDraw,
    finishDraw,
    cancelDraw,
  };
}
```

#### Passo 2.3.6: Criar `useKeyboardShortcuts.ts`

**Escopo**: Handling de teclado isolado

```typescript
// useKeyboardShortcuts.ts
import { useEffect, useCallback } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useDataStore } from "@/stores/useDataStore";

interface KeyboardHandlers {
  onDelete?: () => void;
  onEscape?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectAll?: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardHandlers) {
  const selectedIds = useUIStore((s) => s.selectedShapeIds);
  const deleteShapes = useDataStore((s) => s.deleteShapes);
  const undo = useDataStore((s) => s.undo);
  const redo = useDataStore((s) => s.redo);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Delete/Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handlers.onDelete?.();
        return;
      }

      // Escape
      if (e.key === "Escape") {
        handlers.onEscape?.();
        return;
      }

      // Ctrl/Cmd shortcuts
      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handlers.onRedo?.();
        } else {
          handlers.onUndo?.();
        }
        return;
      }

      if (isMod && e.key === "a") {
        e.preventDefault();
        handlers.onSelectAll?.();
        return;
      }
    },
    [handlers]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
```

#### Passo 2.3.7: Refatorar `EngineInteractionLayer.tsx` como Compositor

**Resultado final**: Componente de ~150 linhas que compõe os hooks

```typescript
// EngineInteractionLayer.tsx (refatorado)
import React, { useCallback } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { usePointerState } from "../hooks/interaction/usePointerState";
import { usePanZoom } from "../hooks/interaction/usePanZoom";
import { useSelectionInteraction } from "../hooks/interaction/useSelectionInteraction";
import { useShapeDrawing } from "../hooks/interaction/useShapeDrawing";
import { useKeyboardShortcuts } from "../hooks/interaction/useKeyboardShortcuts";
import { useTextEditHandler } from "../hooks/useTextEditHandler";
import { useDraftHandler } from "../hooks/useDraftHandler";
import { getCursorForTool, isDrag } from "../utils/interactionHelpers";
import { SelectionOverlay } from "./SelectionOverlay";
import { StrokeOverlay } from "./StrokeOverlay";
import { TextCaretOverlay } from "@/components/TextCaretOverlay";
import { TextInputProxy } from "@/components/TextInputProxy";

export function EngineInteractionLayer() {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const activeTool = useUIStore((s) => s.activeTool);

  // Compose interaction hooks
  const pointer = usePointerState(viewTransform);
  const panZoom = usePanZoom();
  const selection = useSelectionInteraction();
  const drawing = useShapeDrawing();
  const textEdit = useTextEditHandler();
  const draft = useDraftHandler();

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onDelete: () => {
      /* delete selected */
    },
    onEscape: () => {
      drawing.cancelDraw();
      selection.clearSelection();
    },
    onUndo: () => {
      /* undo */
    },
    onRedo: () => {
      /* redo */
    },
  });

  // Unified pointer handlers that delegate to appropriate hook
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointer.handlePointerDown(e);

      if (activeTool === "pan" || e.button === 1) {
        panZoom.beginPan(e.clientX, e.clientY);
        return;
      }

      if (activeTool === "select") {
        // Start selection or box select
        const world = pointer.state.current.downWorldPos!;
        selection.selectAt(world, e.shiftKey);
        return;
      }

      if (["rect", "line", "polyline", "circle"].includes(activeTool)) {
        drawing.beginDraw(
          activeTool as any,
          pointer.state.current.downWorldPos!
        );
        return;
      }

      // ... outros tools
    },
    [activeTool, pointer, panZoom, selection, drawing]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointer.handlePointerMove(e);

      if (panZoom.isPanning) {
        panZoom.updatePan(e.clientX, e.clientY);
        return;
      }

      if (drawing.isDrawing) {
        drawing.updateDraw(pointer.state.current.currentWorldPos!);
        return;
      }

      // ... outros handlers
    },
    [pointer, panZoom, drawing]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointer.handlePointerUp();

      if (panZoom.isPanning) {
        panZoom.endPan();
        return;
      }

      if (drawing.isDrawing) {
        drawing.finishDraw();
        return;
      }

      // ... outros handlers
    },
    [pointer, panZoom, drawing]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      panZoom.handleWheel(e, e.clientX, e.clientY);
    },
    [panZoom]
  );

  const cursor = getCursorForTool(activeTool);

  return (
    <div
      style={{ cursor, position: "absolute", inset: 0 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      <SelectionOverlay />
      <StrokeOverlay drawingState={drawing.drawingState} />
      {textEdit.isActive && <TextCaretOverlay />}
      <TextInputProxy ref={textEdit.proxyRef} />
    </div>
  );
}

export default EngineInteractionLayer;
```

### 2.4 Critérios de Sucesso da Fase 2

- [ ] `EngineInteractionLayer.tsx` reduzido de ~960 para ~150 linhas
- [ ] Cada hook tem testes unitários
- [ ] Comportamento idêntico para todas as ferramentas
- [ ] Nenhuma regressão visual ou funcional
- [ ] Code review aprovado

---

## Fase 3: Decomposição de `TextTool.ts`

**Duração estimada**: 2-3 dias  
**Risco**: Médio (sistema de texto é complexo)  
**Pré-requisitos**: Fase 2 completa (recomendado)

### 3.1 Objetivo

Separar `TextTool.ts` (~1290 linhas) em módulos focados.

### 3.2 Nova Estrutura Proposta

```
frontend/engine/tools/
├── TextTool.ts                → Facade principal (~200 linhas)
├── text/
│   ├── TextCreationHandler.ts → Criação de texto (click, drag)
│   ├── TextEditingHandler.ts  → Edição ativa (input, selection)
│   ├── TextStyleHandler.ts    → Aplicação de estilos
│   ├── TextNavigationHandler.ts → Navegação (arrow keys, word jump)
│   └── TextStateManager.ts    → Gerenciamento de estado
```

### 3.3 Passos de Implementação

#### Passo 3.3.1: Extrair `TextStateManager.ts`

```typescript
// TextStateManager.ts
import type { TextToolState, TextStyleDefaults } from "./types";

export class TextStateManager {
  private state: TextToolState;
  private styleDefaults: TextStyleDefaults;
  private onStateChange: (state: TextToolState) => void;

  constructor(onStateChange: (state: TextToolState) => void) {
    this.state = this.createInitialState();
    this.styleDefaults = this.createDefaultStyles();
    this.onStateChange = onStateChange;
  }

  getState(): TextToolState {
    return this.state;
  }
  getStyleDefaults(): TextStyleDefaults {
    return this.styleDefaults;
  }

  updateState(partial: Partial<TextToolState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange(this.state);
  }

  setActiveText(
    textId: number,
    content: string,
    anchorX: number,
    anchorY: number
  ): void {
    this.updateState({
      mode: "editing",
      activeTextId: textId,
      content,
      anchorX,
      anchorY,
      caretIndex: content.length,
      selectionStart: content.length,
      selectionEnd: content.length,
    });
  }

  clearActiveText(): void {
    this.updateState(this.createInitialState());
  }

  private createInitialState(): TextToolState {
    /* ... */
  }
  private createDefaultStyles(): TextStyleDefaults {
    /* ... */
  }
}
```

#### Passo 3.3.2: Extrair `TextCreationHandler.ts`

```typescript
// TextCreationHandler.ts
import type { TextBridge } from "@/engine/bridge/textBridge";
import type { TextStateManager } from "./TextStateManager";
import { TextBoxMode } from "@/types/text";

export class TextCreationHandler {
  constructor(
    private bridge: TextBridge,
    private stateManager: TextStateManager,
    private onTextCreated: (
      textId: number,
      bounds: { width: number; height: number }
    ) => void
  ) {}

  /**
   * Handle click to create AutoWidth text.
   */
  handleClick(worldX: number, worldY: number): number {
    const textId = this.generateTextId();
    const defaults = this.stateManager.getStyleDefaults();

    this.bridge.upsertText(textId, {
      x: worldX,
      y: worldY,
      rotation: 0,
      boxMode: TextBoxMode.AutoWidth,
      align: defaults.align,
      constraintWidth: 0,
      runs: [this.createDefaultRun()],
      content: "",
    });

    this.stateManager.setActiveText(textId, "", worldX, worldY);
    this.onTextCreated(textId, { width: 0, height: defaults.fontSize });

    return textId;
  }

  /**
   * Handle drag to create FixedWidth text box.
   */
  handleDrag(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): number {
    const width = Math.abs(endX - startX);
    const x = Math.min(startX, endX);
    const y = Math.max(startY, endY); // Y-Up: top is max

    if (width < 10) {
      return this.handleClick(x, y);
    }

    const textId = this.generateTextId();
    // ... create fixed width text
    return textId;
  }

  private generateTextId(): number {
    /* ... */
  }
  private createDefaultRun(): TextRunPayload {
    /* ... */
  }
}
```

#### Passo 3.3.3: Extrair `TextEditingHandler.ts`

```typescript
// TextEditingHandler.ts
import type { TextBridge } from "@/engine/bridge/textBridge";
import type { TextStateManager } from "./TextStateManager";
import type { TextInputDelta } from "@/types/text";

export class TextEditingHandler {
  constructor(
    private bridge: TextBridge,
    private stateManager: TextStateManager,
    private onContentChange: (
      content: string,
      bounds: { width: number; height: number }
    ) => void
  ) {}

  /**
   * Handle text input delta from IME/keyboard.
   */
  handleInputDelta(delta: TextInputDelta): void {
    const state = this.stateManager.getState();
    if (!state.activeTextId) return;

    if (delta.deletedCount > 0) {
      this.handleDeletion(state.activeTextId, delta.deletedCount);
    }

    if (delta.inserted) {
      this.handleInsertion(state.activeTextId, delta.inserted);
    }
  }

  /**
   * Handle selection change.
   */
  handleSelectionChange(start: number, end: number): void {
    const state = this.stateManager.getState();
    if (!state.activeTextId) return;

    this.bridge.setSelection(state.activeTextId, start, end, state.content);
    this.stateManager.updateState({
      caretIndex: end,
      selectionStart: start,
      selectionEnd: end,
    });
  }

  private handleDeletion(textId: number, count: number): void {
    /* ... */
  }
  private handleInsertion(textId: number, text: string): void {
    /* ... */
  }
}
```

#### Passo 3.3.4: Refatorar `TextTool.ts` como Facade

```typescript
// TextTool.ts (refatorado, ~200 linhas)
import { TextStateManager } from "./text/TextStateManager";
import { TextCreationHandler } from "./text/TextCreationHandler";
import { TextEditingHandler } from "./text/TextEditingHandler";
import { TextStyleHandler } from "./text/TextStyleHandler";
import { TextNavigationHandler } from "./text/TextNavigationHandler";
import type { TextBridge } from "@/engine/bridge/textBridge";
import type { EngineRuntime } from "@/engine/core/EngineRuntime";

export class TextTool {
  private stateManager: TextStateManager;
  private creationHandler: TextCreationHandler;
  private editingHandler: TextEditingHandler;
  private styleHandler: TextStyleHandler;
  private navigationHandler: TextNavigationHandler;

  private bridge: TextBridge | null = null;

  constructor(callbacks: TextToolCallbacks) {
    this.stateManager = new TextStateManager(callbacks.onStateChange);
    // Handlers are initialized lazily after bridge is available
  }

  initialize(runtime: EngineRuntime): boolean {
    this.bridge = new TextBridge(runtime);
    if (!this.bridge.initialize()) return false;

    this.creationHandler = new TextCreationHandler(
      this.bridge,
      this.stateManager,
      (id, bounds) => {
        /* callback */
      }
    );
    this.editingHandler = new TextEditingHandler(
      this.bridge,
      this.stateManager /* ... */
    );
    this.styleHandler = new TextStyleHandler(this.bridge, this.stateManager);
    this.navigationHandler = new TextNavigationHandler(
      this.bridge,
      this.stateManager
    );

    return true;
  }

  // Delegate to handlers
  handleClick(x: number, y: number) {
    return this.creationHandler.handleClick(x, y);
  }
  handleDrag(x1: number, y1: number, x2: number, y2: number) {
    return this.creationHandler.handleDrag(x1, y1, x2, y2);
  }
  handleInputDelta(delta: TextInputDelta) {
    this.editingHandler.handleInputDelta(delta);
  }
  applyBold() {
    this.styleHandler.toggleBold();
  }
  applyItalic() {
    this.styleHandler.toggleItalic();
  }
  moveCaret(direction: "left" | "right" | "up" | "down") {
    this.navigationHandler.moveCaret(direction);
  }

  // ... demais delegações
}
```

### 3.4 Critérios de Sucesso da Fase 3

- [ ] `TextTool.ts` reduzido de ~1290 para ~200 linhas
- [ ] Cada handler tem testes unitários
- [ ] Funcionalidade de texto idêntica
- [ ] Nenhuma regressão

---

## Fase 4: Centralização do Sistema de IDs

**Duração estimada**: 1-2 dias  
**Risco**: Baixo  
**Pré-requisitos**: Nenhum (pode ser feita em paralelo)

### 4.1 Objetivo

Criar um serviço centralizado para mapeamento `shapeId: string ↔ engineId: number`.

### 4.2 Nova Estrutura

```
frontend/engine/core/
├── IdRegistry.ts       → Serviço singleton de mapeamento de IDs
└── textEngineSync.ts   → Refatorado para usar IdRegistry
```

### 4.3 Implementação

```typescript
// IdRegistry.ts
/**
 * Centralized ID registry for mapping between JS shape IDs (string)
 * and WASM engine entity IDs (uint32).
 *
 * Single source of truth for all ID mappings in the application.
 */
class IdRegistryImpl {
  private nextEngineId = 1;
  private shapeToEngine = new Map<string, number>();
  private engineToShape = new Map<number, string>();
  private entityMeta = new Map<number, EntityMeta>();

  /**
   * Allocate or retrieve an engine ID for a shape ID.
   * If the shape already has an engine ID, returns the existing one.
   */
  ensureEngineId(shapeId: string): number {
    let engineId = this.shapeToEngine.get(shapeId);
    if (engineId === undefined) {
      engineId = this.nextEngineId++;
      this.shapeToEngine.set(shapeId, engineId);
      this.engineToShape.set(engineId, shapeId);
    }
    return engineId;
  }

  /**
   * Get the engine ID for a shape, or null if not registered.
   */
  getEngineId(shapeId: string): number | null {
    return this.shapeToEngine.get(shapeId) ?? null;
  }

  /**
   * Get the shape ID for an engine ID, or null if not registered.
   */
  getShapeId(engineId: number): string | null {
    return this.engineToShape.get(engineId) ?? null;
  }

  /**
   * Release the mapping for a shape ID.
   * Call when a shape is deleted.
   */
  release(shapeId: string): number | null {
    const engineId = this.shapeToEngine.get(shapeId);
    if (engineId === undefined) return null;

    this.shapeToEngine.delete(shapeId);
    this.engineToShape.delete(engineId);
    this.entityMeta.delete(engineId);

    return engineId;
  }

  /**
   * Store entity-specific metadata.
   */
  setMeta<K extends keyof EntityMeta>(
    engineId: number,
    key: K,
    value: EntityMeta[K]
  ): void {
    const meta = this.entityMeta.get(engineId) ?? {};
    meta[key] = value;
    this.entityMeta.set(engineId, meta);
  }

  /**
   * Get entity metadata.
   */
  getMeta(engineId: number): EntityMeta | null {
    return this.entityMeta.get(engineId) ?? null;
  }

  /**
   * Clear all mappings (e.g., on document reset).
   */
  clear(): void {
    this.shapeToEngine.clear();
    this.engineToShape.clear();
    this.entityMeta.clear();
    this.nextEngineId = 1;
  }

  /**
   * Get all registered shape IDs.
   */
  getAllShapeIds(): string[] {
    return Array.from(this.shapeToEngine.keys());
  }
}

interface EntityMeta {
  entityType?:
    | "rect"
    | "line"
    | "polyline"
    | "text"
    | "circle"
    | "polygon"
    | "arrow"
    | "symbol";
  boxMode?: number; // For text
  constraintWidth?: number; // For text
}

// Singleton export
export const IdRegistry = new IdRegistryImpl();

// Convenience functions for common operations
export const ensureId = (shapeId: string) => IdRegistry.ensureEngineId(shapeId);
export const getEngineId = (shapeId: string) => IdRegistry.getEngineId(shapeId);
export const getShapeId = (engineId: number) => IdRegistry.getShapeId(engineId);
export const releaseId = (shapeId: string) => IdRegistry.release(shapeId);
```

### 4.4 Migração

1. **Atualizar `useEngineStoreSync.ts`**:

   - Importar `IdRegistry` em vez de usar lógica local
   - Substituir `ensureId` local pelo do registry

2. **Atualizar `textEngineSync.ts`**:

   - Usar `IdRegistry` para mapeamento text ↔ shape
   - Remover maps locais (`textIdToShapeId`, `shapeIdToTextId`)

3. **Atualizar demais consumidores**:
   - Buscar todos os usos de mapeamento de ID
   - Migrar para usar `IdRegistry`

### 4.5 Critérios de Sucesso da Fase 4

- [ ] Único ponto de verdade para mapeamento de IDs
- [ ] Todos os testes passando
- [ ] Remoção de código duplicado

---

## Cronograma Resumido

| Fase                               | Duração  | Dependências         | Prioridade |
| ---------------------------------- | -------- | -------------------- | ---------- |
| **Fase 1**: engine.cpp             | 3-4 dias | Nenhuma              | Alta       |
| **Fase 2**: EngineInteractionLayer | 4-5 dias | Nenhuma              | Alta       |
| **Fase 3**: TextTool               | 2-3 dias | Fase 2 (recomendado) | Média      |
| **Fase 4**: IdRegistry             | 1-2 dias | Nenhuma              | Média      |

**Total estimado**: ~12-14 dias de desenvolvimento

---

## Estratégia de Rollout

### Por Fase

1. **Branch dedicada** para cada fase
2. **Feature flag** se necessário (principalmente Fase 2)
3. **PR pequenos** por passo dentro de cada fase
4. **Smoke tests** automatizados a cada merge

### Ordem Recomendada

1. ✅ Fase 4 (IdRegistry) - Independente, baixo risco
2. ✅ Fase 1 (engine.cpp) - Independente, C++ isolado
3. ✅ Fase 2 (EngineInteractionLayer) - Maior impacto, mais testes
4. ✅ Fase 3 (TextTool) - Após Fase 2 estabilizar

---

## Checklist de Validação Final

- [ ] Todos os testes C++ passando
- [ ] Todos os testes frontend passando
- [ ] Build WASM funcional
- [ ] Smoke test manual completo
- [ ] Nenhuma regressão de performance
- [ ] Code coverage mantido ou melhorado
- [ ] Documentação atualizada

---

_Documento gerado em 2025-12-25 como parte da avaliação de codebase EletroCAD._
