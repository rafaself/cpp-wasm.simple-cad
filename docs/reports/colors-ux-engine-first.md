# Cores (Traço/Preenchimento) — Architecture + UX Report

## Executive Summary
- O ribbon atual nao tem controles de cores para Traço/Preenchimento; ha base para controles customizados e um ColorPicker reutilizavel.
- O fluxo de cor hoje e UI-first: `toolDefaults` (Zustand) -> Draft -> comandos com RGBA. Nao ha heranca de camada ou overrides por elemento no engine.
- A proposta adiciona um StyleSystem no engine (layer defaults + overrides por entidade) e um modulo de UI isolado com feature flag, mantendo o motor como fonte de verdade.

## Findings (estado atual)
- Ribbon e configurado em `frontend/features/editor/ui/ribbonConfig.ts` e renderizado em `frontend/features/editor/components/EditorRibbon.tsx`, com grupos customizados (ex.: camadas e texto) em `frontend/features/editor/components/ribbon/LayerRibbonControls.tsx` e `frontend/features/editor/components/ribbon/TextFormattingControls.tsx`.
- Camadas sao geridas pelo engine: `LayerStore` em `cpp/engine/entity/entity_manager.h` e `cpp/engine/entity/entity_manager.cpp`, expostas via WASM em `cpp/engine/bindings.cpp` e acessadas no frontend por `frontend/engine/core/runtime/LayerSystem.ts` e `frontend/engine/core/useEngineLayers.ts`.
- Seleção e fonte de verdade no engine: `runtime.getSelectionIds()` em `frontend/engine/core/runtime/SelectionSystem.ts`, hook `frontend/engine/core/useEngineSelection.ts`, sinais em `frontend/engine/core/engineDocumentSignals.ts` e polling em `frontend/engine/core/useEngineEvents.ts`.
- Fluxo de estilo/cores atual:
  - Defaults de ferramentas vivem em `frontend/stores/useSettingsStore.ts` (strokeColor/fillColor etc.).
  - `frontend/features/editor/interactions/handlers/DraftingHandler.tsx` converte hex -> RGB e manda `CommandOp.BeginDraft` com fill/stroke via `frontend/engine/core/commandBuffer.ts`.
  - No engine, cor e armazenada nos registros de entidades (`RectRec`, `CircleRec` etc.) em `cpp/engine/core/types.h` e usada diretamente no render (`cpp/engine/render/render.cpp`). Nao existe resolver de estilo com heranca.
- ColorPicker ja existe e e usado no Settings/Canvas e Grid: `frontend/components/ColorPicker/index.tsx` e `frontend/features/settings/sections/CanvasSettings.tsx`, alem do controle de grid no ribbon `frontend/features/editor/ribbon/components/GridControl.tsx`. Ha tipos planejados para picker no ribbon em `frontend/features/editor/types/ribbon.ts` (ColorPickerTarget), mas nao ha host nem controles de cores.
- Sidebar de Propriedades/Desenho e placeholder em `frontend/features/editor/components/EditorSidebar.tsx`; nao ha painel de aparencia ativo.
- Eventos do engine ja incluem `ChangeMask.Style` (`frontend/engine/core/protocol.ts`, `cpp/engine/protocol/protocol_types.h`), mas o frontend hoje so usa isso para overlay tick (nao para UI de estilo) em `frontend/engine/core/useEngineEvents.ts`.
- Persistencia e historico nao possuem estilo de camada: `cpp/engine/persistence/snapshot.h` e `cpp/engine/persistence/snapshot.cpp` salvam estilo por entidade, mas `LayerSnapshot` nao contem estilo. O digest inclui estilo das entidades em `cpp/engine/impl/engine_digest.cpp`.
- Gap de documentacao (sugestao de ajuste): `docs/agents/engine-api.md` descreve `beginDraft` como metodo direto, mas na pratica e via `CommandOp.BeginDraft`; e o comentario em `cpp/engine/core/types.h` sobre snapshot vs runtime-only nao bate com a serializacao atual.

## Proposed Architecture (engine-first + modular)
### Objetivo
- Engine e fonte de verdade para estilo: camadas definem defaults; entidades tem overrides opcionais; o UI apenas consulta e envia comandos.
- Implementacao modular: novo modulo de UI isolado + feature flag; minimo de pontos de toque em ribbon/sidebar/bridge.

### Componentes sugeridos
**Engine (C++)**
- `StyleSystem` (novo) com:
  - `LayerStyleStore` (stroke/fill default por layer).
  - `EntityStyleOverrides` (bitmask + valores por entidade).
  - Resolver: `resolveStyle(entityId)` (camada + override).
- `SelectionStyleSummary` (novo) para tri-state e origem por target (stroke/fill), incluindo camada de origem quando uniforme.
- Render pipeline passa a usar estilo resolvido (layer + override) em `cpp/engine/render/render.cpp`.
- Persistencia: expandir `LayerSnapshot` para incluir estilo e salvar overrides por entidade (se overrides forem persistidos; recomendado).

**Bridge/WASM**
- Novos comandos no command buffer (JS -> engine) para set de estilo.
- Novas queries (engine -> JS) para `getSelectionStyleSummary()` e `getLayerStyle()`.

**Frontend (React)**
- Novo modulo isolado: `frontend/features/editor/colors/**`
  - `ColorRibbonControls` (Traço/Preenchimento + toggle Sem preenchimento)
  - `useColorTargetResolver` (prioridade: selecao -> ferramenta ativa -> camada ativa)
  - `useSelectionStyleSummary` (consulta engine, memoizada por sinais)
  - `ColorPickerHost` (reuso de `frontend/components/ColorPicker`)
- Integracao minima:
  - Adicionar grupo “CORES” em `frontend/features/editor/ui/ribbonConfig.ts` com componente custom.
  - Montar `ColorPickerHost` em `frontend/features/editor/components/NextSurface.tsx`.
  - Atualizar `frontend/engine/core/useEngineEvents.ts` para sinalizar mudancas de estilo (novo signal `style` ou `document`).
  - (Opcional) Sidebar de Propriedades com painel de estilo ligado ao mesmo summary.

### Fluxo (diagrama)
```
UI (Ribbon) -> resolve target (selection/tool/layer) -> runtime.apply([StyleCommand])
            -> Engine StyleSystem updates -> Event Stream (DocChanged: Style)
            -> useSelectionStyleSummary() -> Ribbon/Sidebar atualizam

Draft/New entities:
UI -> (tool active) runtime.apply([SetToolStyleOverride])
   -> BeginDraft -> Engine resolve style (layer + tool override) -> render buffers
```

## Action Plan (tarefas + criterios de aceite)

### 0) Refatoracoes necessarias antes da feature
- Objetivo: remover fonte de verdade duplicada de cor (toolDefaults) para shapes.
- Tocar arquivos:
  - `frontend/stores/useSettingsStore.ts`
  - `frontend/features/editor/interactions/handlers/DraftingHandler.tsx`
  - `frontend/features/editor/interactions/useInteractionManager.ts`
- Entregaveis:
  - `strokeColor/fillColor` deixam de dirigir estilo final de entidade; Draft usa estilo resolvido pelo engine.
- Aceite:
  - Criacao de shapes sem selecao usa estilo de camada resolvido pelo engine (sem cor computada no UI).

### 1) Engine StyleSystem + persistencia
- Tocar arquivos:
  - `cpp/engine/entity/entity_manager.h` / `cpp/engine/entity/entity_manager.cpp`
  - `cpp/engine/render/render.cpp`
  - `cpp/engine/persistence/snapshot.h` / `cpp/engine/persistence/snapshot.cpp`
  - `cpp/engine/history/history_manager.cpp`
  - `cpp/engine/impl/engine_digest.cpp`
- Entregaveis:
  - `LayerStyle` (stroke/fill + enable) por camada.
  - Overrides por entidade (stroke/fill + enable), com bitmask de origem.
  - Resolver unico para estilo final.
- Aceite:
  - Alterar estilo de camada atualiza entidades herdadas sem reescrever cada entidade.
  - Overrides persistem em snapshot e funcionam com undo/redo.

### 2) API/Command buffer para estilo
- Tocar arquivos:
  - `cpp/engine/command/command_dispatch.cpp`
  - `cpp/engine/bindings.cpp`
  - `cpp/engine/protocol/protocol_types.h`
  - `frontend/engine/core/commandBuffer.ts`
  - `frontend/engine/core/protocol.ts`
  - `frontend/engine/core/wasm-types.ts`
  - `frontend/engine/core/EngineRuntime.ts`
- Entregaveis:
  - Novos `CommandOp` para layer style + overrides + restore.
  - Query `getSelectionStyleSummary()` e `getLayerStyle(layerId)`.
  - Versionamento atualizado (Protocol/Command/Snapshot).
- Aceite:
  - `runtime.apply([StyleCommand])` altera estilo e dispara `ChangeMask.Style`.
  - API tipada em TS sem uso de `any`.

### 3) Sinais de atualizacao de estilo
- Tocar arquivos:
  - `frontend/engine/core/engineDocumentSignals.ts`
  - `frontend/engine/core/useEngineEvents.ts`
- Entregaveis:
  - Novo signal `style` (ou bump em `document`) quando `ChangeMask.Style` ocorrer.
- Aceite:
  - Controles de cor re-renderizam quando um override de estilo muda.

### 4) UI: Ribbon “CORES” + ColorPickerHost
- Tocar arquivos:
  - `frontend/features/editor/ui/ribbonConfig.ts`
  - `frontend/features/editor/components/EditorRibbon.tsx`
  - `frontend/features/editor/components/NextSurface.tsx`
  - `frontend/features/editor/colors/**` (novo modulo)
  - `frontend/components/ColorPicker/index.tsx` (reuso)
- Entregaveis:
  - Dois controles ativos (Traço/Preenchimento) com swatch/picker.
  - Toggle “Sem preenchimento” no fill.
  - Indicadores de estado (herdado/override/none/mixed).
- Aceite:
  - Mudanca de cor aplica corretamente com a ordem: selecao -> ferramenta -> camada.
  - Multi-select mostra “Múltiplos valores”.

### 5) (Opcional) Sidebar de Propriedades
- Tocar arquivos:
  - `frontend/features/editor/components/EditorSidebar.tsx`
  - `frontend/features/editor/colors/**`
- Entregaveis:
  - Painel de estilo reutilizando `useSelectionStyleSummary()`.
- Aceite:
  - Mudancas no ribbon refletem instantaneamente no painel.

### 6) Testes
- Tocar arquivos:
  - `cpp/tests/**`
  - `frontend/features/editor/colors/**.test.tsx`
- Aceite:
  - Testes engine: heranca e override por camada, fill none.
  - Testes UI: mapeamento de estados + target resolver.

## API Contract Proposal (engine <-> UI)

### Commands (JS -> Engine)
- `setLayerStyle(layerId, strokeRGBA, fillRGBA, strokeEnabled, fillEnabled, strokeWidthPx)`
  - Local: novo `CommandOp.SetLayerStyle` em `frontend/engine/core/commandBuffer.ts` e `cpp/engine/command/command_dispatch.cpp`.
- `setElementStyleOverride(ids[], target, colorRGBA, enabled?)`
  - `target`: `stroke` | `fill`.
  - Local: `CommandOp.SetEntityStyleOverride`.
- `restoreElementFromLayer(ids[], target)`
  - Local: `CommandOp.ClearEntityStyleOverride`.
- `setElementFillNone(ids[], enabled)`
  - Local: `CommandOp.SetEntityFillEnabled` (fill only).

### Queries (Engine -> JS)
- `querySelectionStyleState()`
  - Retorna resumo tri-state por target (stroke/fill), incluindo `source` (layer/override/mixed), `resolvedColorRGBA`, `fillEnabled`, `layerId` (se uniforme).
  - Local: `CadEngine::getSelectionStyleSummary()` exposto em `cpp/engine/bindings.cpp` e tipado em `frontend/engine/core/wasm-types.ts`.
- `getLayerStyle(layerId)`
  - Retorna estilo default da camada (stroke/fill + enabled).

### Versionamento
- Atualizar `PROTOCOL_VERSION`, `COMMAND_VERSION`, `SNAPSHOT_VERSION` em `frontend/engine/core/protocol.ts` e `cpp/engine/protocol/protocol_types.h`.
- Atualizar ABI hash em `cpp/engine/engine_protocol_types.h`.
- Sem backward compatibility: ajustar chamadas no frontend imediatamente (sem shims).

## UI State Model (mapeamento de estados)

### Estados por target (stroke/fill)
- **Herdado (🔗)**: estilo vem da camada ativa/da camada da entidade.
- **Override (🔓)**: estilo do elemento sobrescreve a camada.
- **None (fill apenas)**: fill desativado.
- **Mixed**: multi-select com valores divergentes.

### Tooltips (exatamente como especificado)
- “Cor herdada da camada “{nome}””
- “Cor personalizada do elemento”
- “Sem preenchimento”
- “Múltiplos valores”

### Tabela de mapeamento (estado -> icon -> tooltip -> engine)
| Estado | Icone | Tooltip | Campo engine |
| --- | --- | --- | --- |
| Herdado | 🔗 | Cor herdada da camada “{nome}” | `source=Layer`, `layerId` uniforme |
| Override | 🔓 | Cor personalizada do elemento | `source=Override` |
| None (fill) | ⦸ | Sem preenchimento | `fillEnabled=false` |
| Mixed | ≋ | Múltiplos valores | `mixed=true` |

## Risks & Mitigations
- **Risco: duplicacao de fonte de verdade (UI vs Engine)**
  - Mitigacao: remover `strokeColor/fillColor` como origem de estilo final no UI; usar apenas engine para resolver estilo.
- **Risco: performance em resolver estilo por entidade no render**
  - Mitigacao: resolver por layer + override em estruturas compactas (arrays ou maps) e evitar alocacoes no hot path.
- **Risco: multi-select entre tipos (linha, shape, texto)**
  - Mitigacao: `SelectionStyleSummary` deve respeitar `supportsStroke`/`supportsFill` por EntityKind (linhas = stroke-only, texto = fill-only).
- **Risco: UI nao atualizar em mudancas de estilo**
  - Mitigacao: novo signal `style` ligado a `ChangeMask.Style` em `useEngineEvents.ts`.
- **Risco: documentacao desalinhada**
  - Mitigacao: atualizar `docs/agents/engine-api.md` e comentarios em `cpp/engine/core/types.h`.

## Rollback Strategy
- Feature flag (ex.: `featureFlags.enableColorsRibbon`) para desativar UI sem remover engine.
- Modulo isolado `frontend/features/editor/colors/**` pode ser removido sem tocar o restante (apenas limpar `ribbonConfig` e host em `NextSurface`).
- Em caso de rollback completo: remover novos CommandOps e `StyleSystem`, reverter versoes de protocolo/command/snapshot (sem shims, conforme regra global).
