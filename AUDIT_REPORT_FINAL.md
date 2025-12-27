# Relatório de Auditoria: EletroCAD WebApp

## 5.1 Veredito

# ✅ APROVADO (Engine-First Real)

O projeto demonstra uma adesão sólida à arquitetura C++ Engine-First. O Engine (WASM) é a fonte de verdade para geometria, renderização e lógica de interação. O Frontend (React) atua corretamente como uma camada de View e Controller, delegando operações pesadas e gestão de estado para o C++.

Existem **violações menores** relacionadas a código morto (vestígios de arquitetura antiga) e duplicação de estado em ferramentas de texto, mas que não comprometem a integridade arquitetural do sistema em execução.

## 5.2 Evidências

| Regra                     | Status  | Evidência (Arquivo:Linha)                                            | Observação                                                                           |
| :------------------------ | :------ | :------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| **1.1 Fonte de Verdade**  | ✅ PASS | `cpp/engine/engine.h`:333 (`UIManager`, `EntityManager`)             | O Engine mantém entidades, layers e seleção de forma autoritativa.                   |
| **1.2 Comandos**          | ✅ PASS | `frontend/engine/core/commandBuffer.ts`:226                          | Frontend serializa comandos (Insert, Update) e envia buffer binário para o WASM.     |
| **1.3 Determinismo**      | ✅ PASS | `cpp/engine/engine.h`:413 (`history_`)                               | Histórico (Undo/Redo) gerenciado no engine.                                          |
| **1.4 Persistência**      | ✅ PASS | `frontend/features/editor/components/EditorRibbon.tsx`:29            | `runtime.saveSnapshotBytes()` gera blob binário direto do engine.                    |
| **2.1 Anti-Geometria JS** | ✅ PASS | `frontend/features/editor/components/EngineInteractionLayer.tsx`:383 | Picking complexo delegado para `runtime.pickEx`.                                     |
| **2.2 Renderização**      | ✅ PASS | `frontend/engine/core/CanvasController.ts`:80                        | Renderizador WebGL puxa buffers de vértices direto da memória WASM.                  |
| **2.3 API Fronteira**     | ✅ PASS | `frontend/engine/core/protocol.ts`                                   | Uso eficiente de buffers binários e memória compartilhada (Copy-less onde possível). |

## 5.3 Top Violações e Código Morto

### 1. Código Morto de Snapping em JS

**Local:** `frontend/features/editor/snapEngine/index.ts`
**Problema:** Implementa lógica de snapping geométrico (cálculo de endpoints, midpoints) iterando sobre um array de `Shapes` em Typescript.
**Risco:** Alto se fosse usado. Como não há referências ativas no código de produção (verificado via grep), trata-se de **Dead Code** que confunde a arquitetura.
**Correção:** **Remover diretório inteiro.**

### 2. Duplicação de Estado no TextTool

**Local:** `frontend/engine/tools/TextTool.ts` (Linhas 56, 350, 593)
**Problema:** O `TextTool` mantém uma cópia local de `content` (string) que é atualizada paralelamente ao envio de comandos para o Engine.
**Risco:** "Dual Write". Se o engine rejeitar ou transformar o input de forma diferente do JS, o editor de texto desincroniza.
**Correção:** Fazer o componente de input (TextInputProxy) ler o valor "commited" do engine durante o render ou eventos de sincronização.

### 3. Geração de IDs de Layer no JS

**Local:** `frontend/engine/core/LayerRegistry.ts`
**Problema:** O método `ensureEngineId` gera IDs sequenciais no JavaScript se não existirem.
**Risco:** Conflitos de ID em cenários de colaboração ou reload se não houver handshake estrito.
**Correção:** Mover `allocateLayerId()` para o C++ (similar ao `allocateEntityId`).

### 4. Código Morto de "Render Extract"

**Local:** `frontend/src/next/renderExtract.ts`
**Problema:** Código para converter Shapes em lista de renderização JS. Não utilizado pelo pipeline WebGL atual.
**Correção:** Remover.

## 5.4 Plano de Correção

### Fase 1: Limpeza (Imediato)

1.  **Excluir** `frontend/features/editor/snapEngine` (Dead Code).
2.  **Excluir** `frontend/src/next/renderExtract.ts` (Dead Code).
3.  **Auditar** imports para garantir que ninguém dependa de tipos "legacy" definidos nesses arquivos.

### Fase 2: Robustez (Curto Prazo)

1.  **Refatorar `TextTool.ts`:** Remover `this.state.content`. Usar `bridge.getTextContent(id)` como fonte única ou garantir mecanismo de subscrição de mudanças.
2.  **Mover ID de Layer:** Implementar `cad_allocate_layer_id` no C++ e remover lógica de autoincremento do `LayerRegistry.ts`.

### Fase 3: Qualidade

1.  **Implementar Testes de Determinismo:** Criar script que grava sequência de comandos e verifica snapshot binário vs "golden file".

---

## ADDENDUM — Grid Snap Ativo no Frontend

**Status:** CONFIRMADO

**Evidência técnica:**

- **Arquivo:** `frontend/features/editor/components/EngineInteractionLayer.tsx`
- **Função:** `handlePointerMove` (e `handlePointerDown`)
- **Linha aproximada:** 474 (cálculo de `snapped`), 481 (envio para engine)
- **Trecho relevante:**
  ```typescript
  const snapped =
    activeTool === "select"
      ? world
      : snapOptions.enabled && snapOptions.grid
      ? snapToGrid(world, gridSize)
      : world;
  // ...
  runtimeRef.current.updateTransform(snapped.x, snapped.y);
  ```
- **Helper:** `frontend/features/editor/utils/interactionHelpers.ts` define `snapToGrid` usando `Math.round`.

**Fluxo identificado:**
UI Event (`pointermove`) → cálculo de coordenadas no TS (`toWorldPoint`) → aplicação de snap matemático no TS (`snapToGrid`) → valor ajustado passado para `runtime.updateTransform(x,y)` ou para `draftHandlePointerMove` → Engine recebe coordenadas já estaladas e muta o documento (ou cria entidades na posição estalada).

**Classificação arquitetural:**
⚠️ **Risco potencial (regra de edição fora do engine).**
Embora não quebre o determinismo (pois o JS envia o valor final autoritativo), viola o princípio de que "o Engine aplica as regras de constraint". O Engine está agindo passivamente aceitando qualquer coordenada que o JS diz ser a "correta".

**Impacto real:**

1.  **Evolução para Object Snap:** Se quisermos implementar "Snap to Vertex" ou "Snap to Edge" (feature comum de CAD), fazer isso no JS exigirá round-trips caros de query (JS pergunta pro Engine "o que está perto?" a cada frame). O ideal seria o Engine calcular qualquer snap.
2.  **Manutenção:** Lógica de grid espalhada no `EngineInteractionLayer` e `useDraftHandler`.

**Recomendação objetiva:**

1.  **Mover Grid Snap para o Engine (P2):**
    - Criar `engine.setSnapOptions({ grid: 10, enabled: true })` via protocolo.
    - Alterar `updateTransform(x, y)` para aceitar coordenadas raw e o engine aplicar o snap internamente antes de commitar.
    - Para ferramentas de criação (Draft), usar uma query `engine.getSnappedPoint(x, y)` ou similar, ou enviar o ponto raw e deixar o comando `Upsert` aplicar o snap (menos responsivo na UI, então a query é melhor).
