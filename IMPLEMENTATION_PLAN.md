# Plano de Implementação: Engine-First Refactor

Este documento descreve o plano passo-a-passo para resolver as violações e débitos técnicos identificados no `AUDIT_REPORT_FINAL.md`.

## Objetivo

Eliminar código morto, remover "dual writes" (fontes de verdade duplicadas) e mover a autoridade de constraints (snapping, IDs) inteiramente para o C++ Engine.

---

## ✅ Fase 1: Limpeza & Higiene (Concluído)

**Meta:** Remover código legado que confunde a arquitetura e não é mais utilizado.

### 1.1 Remover diretório `snapEngine` (JS Legacy)

- **Status:** ✅ Concluído.
- **Alvo:** `frontend/features/editor/snapEngine/`
- **Ação:** Excluir recursivamente.
- **Verificação:** Garantir que nenhum arquivo importa `detectors.ts` ou `svgBackground.ts`.

### 1.2 Remover `renderExtract.ts` (JS Legacy)

- **Status:** ✅ Concluído.
- **Alvo:** `frontend/src/next/` (Diretório inteiro removido, incluindo `renderExtract.ts` e `snapBatch.ts`).
- **Ação:** Excluir arquivo.
- **Verificação:** Verificar imports em `App.tsx` ou outros entrypoints (nota: `buildRenderBatch` não deve ser usado).
- **Nota:** `frontend/src` estava vazio após a remoção e também foi removido.

---

## 🚧 Fase 2: Robustez & Single Source of Truth (Concluído)

**Meta:** Garantir que ID generation e Estado de Texto sejam exclusivos do Engine.

### 2.1 Mover Geração de Layer ID para C++

- **Problema:** `LayerRegistry.ts` gera IDs sequenciais localmente, podendo causar colisão.
- **Status:** ✅ Concluído.
- **Passo 2.1.1 (C++):** `nextLayerId_` e `allocateLayerId()` adicionados.
- **Passo 2.1.2 (Bindings):** Binding implementado em `bindings.cpp`.
- **Passo 2.1.3 (TS):** `LayerManagerModal.tsx` e `EngineRuntime` atualizados.

### 2.2 Refatorar `TextTool` (Remover Dual Write)

- **Problema:** `TextTool.ts` mantém `this.state.content` (string) além do engine.
- **Status:** ✅ Concluído.
- **Passo 2.2.1:** `TextToolState` atualizado (content é apenas cache).
- **Passo 2.2.2:** `handleInputDelta` e pointer events atualizados para usar `getPooledContent()` (Single Source of Truth).
- **Passo 2.2.3:** "Dual Write" eliminado.

---

## 🚀 Fase 3: Engine-Native Constraints (Evolução)

**Meta:** Mover lógica de Grid Snap (atualmente no TS) para o Engine, habilitando futuro Object Snap.

### 3.1 Implementar Snap System no C++

- **Passo 3.1.1 (C++):**
  - Criar struct `SnapOptions` em `engine.h` (enabled, gridSize).
  - Adicionar `void setSnapOptions(...)` na API.
- **Passo 3.1.2 (C++):**
  - Criar método `PickResult getSnappedPoint(float x, float y)` que aplica grid snap (e futuramente vertex snap).

### 3.2 Atualizar Interaction Session (C++)

- **Passo 3.2.1:**
  - Em `CadEngine::updateTransform(x, y)`, aplicar o snap internamente antes de processar a transformação.
  - Isso garante que `move`, `resize`, `vertex_drag` respeitem o grid autoritativamente.

### 3.3 Migrar Frontend

- **Passo 3.3.1:**
  - Remover `snapToGrid` de `interactionHelpers.ts`.
  - No `EngineInteractionLayer.tsx`, enviar coordenadas RAW (`world.x`, `world.y`).
  - Atualizar visualização de draft (fantasmas) para consultar `runtime.getSnappedPoint()` se necessário, ou confiar no update do engine.

---

## Execução

A ordem recomendada é sequencial: Fase 1 -> Fase 2 -> Fase 3.
A Fase 1 pode ser executada imediatamente sem riscos ao runtime atual.
