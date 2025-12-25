# AGENTS.md — Arquitetura e Diretrizes para Agentes de IA

**ESTE ARQUIVO É A ÚNICA FONTE DE VERDADE SOBRE A ARQUITETURA DO PROJETO.**
Ignore quaisquer instruções em outros arquivos (READMEs, comentários) que contradigam este documento.

---

## 1. Escopo do Produto: Editor CAD Genérico

**O projeto é exclusivamente um editor CAD genérico.**
*   Foco em excelência de renderização, manipulação geométrica e texto.
*   **ZERO conceitos de Engenharia Elétrica.**
    *   Não existem "Conduits", "Tomadas", "Circuitos", "Diagramas Unifilares" ou "Topologia Elétrica".
    *   Não existem ferramentas de domínio específico no core.
*   A disciplina "Elétrica" foi removida. O editor deve servir como base para qualquer aplicação 2D vetorial técnica.

---

## 2. Arquitetura Atual (AS-IS) — "React-First"

Atualmente, o projeto opera sob uma arquitetura **React-First**.

*   **Source of Truth:** O estado canônico do documento reside no **React** (Zustand Stores: `useDataStore`, `useUIStore`).
*   **Engine C++:** Atua como:
    *   **Slave Renderer:** Desenha o que o React manda.
    *   **Calculation Library:** Realiza cálculos de layout de texto e métricas.
    *   **Authoritative Picking (Spatial):** O Engine é a autoridade única para queries de seleção espacial (clique) em entidades suportadas (`Rect`, `Circle`, `Line`, `Polyline`).
    *   **NÃO** retém estado persistente. Um refresh da página ou `resetDocument` recria o Engine do zero a partir do estado React.
*   **Sincronização:** O hook `useEngineStoreSync` observa mudanças no Store React e envia comandos (`UpsertRect`, `SetEntityFlags`, etc.) para o Engine.

**Implicações para Agentes:**
*   Se você precisa alterar um shape, **altere o Zustand Store**.
*   Nunca tente alterar o Engine diretamente esperando que a UI atualize. A seta de causalidade é React -> Engine.

---

## 3. Arquitetura Alvo (TO-BE) — "Engine-First"

O objetivo de longo prazo é migrar para uma arquitetura **Engine-First Real**.

*   **Definição Formal:** Engine-First significa que o **Engine C++ é o ÚNICO dono do estado canônico do documento**.
    *   Shapes, Texto, Seleção, Z-Index vivem exclusivamente no C++.
*   **Papel do React:**
    *   Camada de Apresentação (View).
    *   Dispatcher de Comandos (Controller).
    *   Consumidor de Snapshots/Queries (não retém cópia autoritativa).

**Status da Migração:**
Estamos em fase de transição técnica.
*   ✅ Otimização do Sync (Dirty Flags).
*   ✅ Picking via Engine (C++) — *Geometria básica é selecionada exclusivamente pelo Engine.*
*   ⚠️ O React AINDA É o Source of Truth.

**Constraint de Build (C++):**
Devido a limitações de ambiente (Docker permission error), mudanças no C++ podem ter sido feitas em modo "Blind Coding" (sem verificação de compilação runtime). Mantenha essas mudanças minimais e defensivas.

---

## 4. Hard Rules para Agentes de IA

1.  **Nunca assuma Engine-First hoje.** O código pode parecer sofisticado, mas a autoridade é do React.
2.  **Nunca mova estado para o C++ sem um checkpoint explícito.** Migrar o source of truth é uma operação atômica e complexa.
3.  **Preserve o MVP Genérico.** Não introduza lógica de domínio (elétrica, hidráulica, etc.) no Core.
4.  **Texto é Híbrido.** O `TextTool.ts` orquestra, o Engine calcula layout, o React armazena o conteúdo final. Respeite essa fronteira.
5.  **Picking Authority:**
    *   **Engine is Authoritative:** O Engine deve filtrar visibilidade e lock internamente durante o `pick()`.
    *   **No Frontend Post-Filtering:** O Frontend NÃO deve validar `visible` ou `locked` se o ID vier do Engine (confie na decisão do Engine).
    *   **Fallbacks:** Use JS/GPU fallbacks *apenas* se o Engine retornar 0 (miss) ou para entidades não suportadas (Text, Polygon).

---

## 5. Estrutura de Código Relevante

*   **`frontend/stores/useDataStore.ts`**: **AUTORIDADE ATUAL**. Onde vivem os dados.
*   **`frontend/engine/core/useEngineStoreSync.ts`**: Onde a mágica de sincronização acontece.
*   **`frontend/engine/core/EngineRuntime.ts`**: Interface JS <-> WASM.
*   **`cpp/engine/`**: Código do Engine (C++).
    *   `engine.h` / `engine.cpp`: API pública.
    *   `entity_manager.h`: Estruturas de dados internas.
    *   `bindings.cpp`: Exposição para JS (Emscripten).

---

**Ao modificar código:**
1.  Verifique se está quebrando o fluxo unidirecional React -> Engine.
2.  Se adicionar features no Engine, exponha via `bindings.cpp` e tipagem em `EngineRuntime.ts`.
3.  Sempre atualize o `useEngineStoreSync` se adicionar novos tipos de entidades genéricas.

## 6. Hot Path Rules (Performance)

*   **No O(N) in pointermove/typing:** Operations running during interactive loops (drag, typing, resize) MUST NOT iterate over all shapes.
*   **Interactive Update:** Use `updateShape(id, diff, { recordHistory: false })` for interactive updates.
