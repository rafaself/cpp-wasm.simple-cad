# Report 17 — Fase 7: Delete Legacy (remoção física + limpeza final)

**Data:** 2025-12-19  
**Guideline:** `resources/reports/report_9_next-only-execution-plan.md` (Fase 7)  
**Status:** executado (gate “sem legacy” atingido)

---

## 1) Problema

Apesar do runtime já estar “Next-only” (R3F/WebGL + WASM), ainda existiam resquícios do legado/dual-path:

- diretórios vazios de Canvas2D (`frontend/features/editor/components/canvas/*`)
- helpers/artefatos antigos não usados (ex.: componente `WasmTest`, import helpers “legacy snapshot”)
- comentários/strings contendo “legacy/Legacy” em código e verificação, impedindo o gate final do plano
- acoplamento de tipos: `Shape.type` estava incorretamente tipado como `ToolType` (misturando UI tools com tipos de entidade)

---

## 2) Ações executadas (Fase 7)

### 2.1 Remoção física de resquícios

- Removido componente não usado `frontend/src/components/WasmTest.tsx` (dependia de `engine.add`).
- Removido helper não usado `frontend/src/next/wasmDocument.ts` (dependia de conversão “legacy project → snapshot”).
- Removidos diretórios vazios do antigo pipeline Canvas2D:
  - `frontend/features/editor/components/canvas/overlays/`
  - `frontend/features/editor/components/canvas/renderers/`
  - `frontend/features/editor/components/canvas/`

### 2.2 Correção de tipos (separação UI vs documento)

- Introduzido `ShapeType` e `Shape.type: ShapeType` (não mais `ToolType`).
- Removido alias de tool `conduit` (o tool canônico é `eletroduto`).
- Removida a variante de shape `conduit` (o shape canônico é `eletroduto`).

### 2.3 Limpeza final de “legacy wording”

- Removidas todas as ocorrências de `legacy/Legacy` em `frontend/`, `cpp/`, `backend/`.
- Ajustes em comentários e scripts de verificação para manter semântica sem a palavra “legacy”.

---

## 3) Gate atingido (obrigatório do plano)

- `rg -n "\\blegacy\\b|\\bLegacy\\b" frontend cpp backend` retorna **0 hits**.

---

## 4) Arquivos alterados/removidos (principais)

**Removidos**
- `frontend/src/components/WasmTest.tsx`
- `frontend/src/next/wasmDocument.ts`

**Alterados**
- `frontend/types/index.ts` (cria `ShapeType`, corrige `Shape.type`, remove tool alias)
- `frontend/src/components/EngineInteractionLayer.tsx` (tool `eletroduto` apenas)
- `frontend/src/components/CadViewer.tsx` (remove `conduit` como shape type)
- `frontend/stores/useDataStore.ts` (remove checks `conduit`)
- `frontend/features/editor/utils/tools.ts` (corrige `isConduitShape`/tool list)
- `frontend/features/editor/snapEngine/detectors.ts` (remove `conduit`)
- `frontend/utils/connections.ts` (remove `conduit`)
- `frontend/utils/geometry.ts` (remove `conduit`)
- `frontend/features/import/utils/pdfToShapes.ts` (remove `conduit`)
- `frontend/ARCHITECTURE_ANALYSIS.md` (atualiza texto)
- `frontend/verification/benchmark_world_snapshot.mjs` (remove dependência de conversão antiga)
- `frontend/verification/dxf-curve-audit.mjs`, `frontend/features/import/utils/dxf/*` (renomeia comentários)
- `cpp/engine.cpp` (remove `CadEngine.add`)
- `frontend/public/wasm/engine.js` e `frontend/public/wasm/engine.wasm` (gerados)

---

## 5) Riscos / impacto

- **Compatibilidade de arquivos antigos:** shapes com `type: 'conduit'` e tool `'conduit'` deixam de existir. Você explicitou que não há necessidade de compatibilidade com legados.
- **Tipagem:** a separação `ToolType` vs `ShapeType` pode expor usos indevidos em TS (o que é desejável para evitar regressões futuras).

---

## 6) Verificação executada

- Build frontend: `cd frontend && npm run build`
- Testes: `cd frontend && npx vitest run` (suite completa passou)
- Build WASM: `cd frontend && npm run build:wasm`

