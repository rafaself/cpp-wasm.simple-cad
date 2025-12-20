# Phase 2 – Progress (Next Steps Executed)

## Problema / motivação

Após a remoção do pipeline Canvas2D, ainda havia:

- Falhas de UX: seleção não tinha highlight no modo “embedded” do viewer.
- Falta de edição básica: `move` não funcionava no novo `EngineInteractionLayer`.
- Resíduos “legacy” ainda presentes no código (Canvas2D surfaces/engine backend switch), incluindo imports que quebram build quando os arquivos legacy são removidos.

## O que foi feito

### 1) Seleção voltou a ter highlight no Viewer (WebGL)

- `frontend/src/components/CadViewer.tsx`
  - `SelectionOverlay` passa a renderizar também quando `embedded`.
  - Motivo: em `NextSurface`, o viewer roda como `embedded`, então sem isso o usuário selecionava mas não via feedback.

### 2) Implementado `move` no novo overlay

- `frontend/src/components/EngineInteractionLayer.tsx`
  - Implementação básica de `move`: arrastar shapes selecionados e soltar para commit.
  - Durante drag: atualiza shapes com `recordHistory=false`.
  - No pointer-up: cria um único batch de patches via `saveToHistory`.
  - Conduits (`eletroduto/conduit`) são ignorados no move por enquanto para não quebrar semântica de ancoragem.

### 3) Remoção efetiva do legado Canvas2D e backend switch

Arquivos removidos (não eram mais usados pelo runtime atual `NextSurface`):

- `frontend/src/components/LegacySurface.tsx`
- `frontend/src/components/CadSurfaceHost.tsx`
- `frontend/src/engineBackend.ts`
- `frontend/features/editor/components/EditorCanvas.tsx`
- `frontend/features/editor/components/canvas/*` (Canvas2D overlay/renderers)
- `frontend/features/editor/interaction/useCanvasInteraction.ts`

### 4) Correção de build após remoção do legado

- `frontend/stores/useLibraryStore.ts`
  - Removido import/uso de `preloadElectricalSymbol` (dependia do renderer Canvas2D removido).

### 5) Documentação atualizada (para refletir arquitetura atual)

- `frontend/ARCHITECTURE_ANALYSIS.md`
  - Atualizado para descrever o pipeline atual (WASM buffers + R3F + overlay HTML).

## Arquivos alterados

- `frontend/src/components/CadViewer.tsx`
- `frontend/src/components/EngineInteractionLayer.tsx`
- `frontend/stores/useLibraryStore.ts`
- `frontend/features/editor/components/EditorSidebar.tsx`
- `frontend/ARCHITECTURE_ANALYSIS.md`

## Arquivos removidos

- `frontend/src/components/LegacySurface.tsx`
- `frontend/src/components/CadSurfaceHost.tsx`
- `frontend/src/engineBackend.ts`
- `frontend/features/editor/components/EditorCanvas.tsx`
- `frontend/features/editor/components/canvas/CanvasManager.tsx`
- `frontend/features/editor/components/canvas/DynamicOverlay.tsx`
- `frontend/features/editor/components/canvas/StaticCanvas.tsx`
- `frontend/features/editor/components/canvas/helpers.ts`
- `frontend/features/editor/components/canvas/overlays/TextEditorOverlay.tsx`
- `frontend/features/editor/components/canvas/renderers/GhostRenderer.ts`
- `frontend/features/editor/components/canvas/renderers/SelectionRenderer.ts`
- `frontend/features/editor/components/canvas/renderers/ShapeRenderer.ts`
- `frontend/features/editor/interaction/useCanvasInteraction.ts`

## Riscos / notas

- `move` ainda é “mínimo viável” (translate). Ainda faltam: rotate/resize/handles/selection box com modos window/crossing.
- Conduits não são movidos (intencional, até termos regras/UX para ancoragem).
- `electrical-symbol` ainda renderiza como “rect placeholder” no WASM (texto/símbolo via atlas/instancing virá em fases posteriores).

## Verificação

- `cd frontend && npm run build`
- `cd frontend && npm run dev`
  - Teste manual: selecionar shape e confirmar highlight; `move` com drag.
  - `pan`/`zoom` continuam funcionando no overlay.

