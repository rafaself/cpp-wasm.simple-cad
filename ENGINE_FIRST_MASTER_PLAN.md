# ENGINE-FIRST MASTER PLAN (DEFINITIVO)

**Regra de governança (anti-regressão social):** qualquer feature nova que dependa do documento deve ser implementada primeiro no engine. PRs que introduzam geometria/estado autoritativo no JS (fora do UI state e viewport math) são rejeitados.

**Normas normativas (Apêndice A):** este documento inclui A1–A5 (baselines de `requiredFeatureFlags`, digest, regras do renderer em interação e enforcement anti-geometria-JS). Esses itens são **gates** e não podem ser relaxados.

## 1. Definition of Done (Engine-First REAL)

- **Fonte de verdade única:** O estado canônico do documento existe exclusivamente no Engine C++ (WASM). Isso inclui: entidades/shapes (geometria + estilo necessário ao render/pick), layers, z-order/draw order, flags (visible/locked), seleção, texto (conteúdo + runs/estilos + layout state) e geração de IDs.
- **Persistência engine-only:** O documento salva e abre **sem** depender de JSON autoritativo no Zustand. O arquivo contém um snapshot binário do engine (obrigatório). Qualquer JSON no arquivo (se existir por compatibilidade) não é usado para restaurar o documento canônico.
- **Reload-proof:** Um reload do React (F5) + “Open file” reconstrói o documento 100% a partir de `engine.loadSnapshot(...)`/`engine.loadDocument(...)`, sem re-upsert por JS e sem divergência visual/funcional.
- **Sem sync autoritativo Store→Engine:** `useEngineStoreSync` deixa de reger o documento. Na transição pode existir adapter temporário, mas no final (PR-07+) ele é **removido** do codebase e qualquer tentativa de import/chamada deve quebrar o build/CI (sem “reativar só para corrigir um bug”).
- **Command Pattern real:** O frontend envia apenas intents/comandos (“CreateRect”, “BeginTransform”, “SetLayerVisible”, etc.). O engine aplica, muta o documento e emite eventos/deltas. A UI reconstrói a visão por snapshots/queries/events.
- **Undo/Redo engine-owned:** Undo/redo funciona com o Zustand sem documento. A UI só chama `engine.undo()`/`engine.redo()`. O engine mantém history (command-based), emite eventos e o renderer reflete o estado.
- **IDs engine-owned e estáveis:** O engine aloca IDs (u32/u64) e persiste no snapshot. JS não gera IDs canônicos; no máximo consome IDs do engine como keys/refs de UI.
- **ABI/Protocol fail-fast + compat controlada:** Existe handshake obrigatório no startup (`ProtocolInfo` + `featureFlags`). O frontend **não** decide capabilities por `typeof`. Compatibilidade durante rollout acontece **somente** via `protocolVersion + featureFlags` do handshake; builds incompatíveis (version/hash/required flags) são **bloqueadas explicitamente** (“engine incompatível”), sem fallback silencioso.
- **Overlays sem geometria em JS:** Selection outline/handles/caret/selection rects e queries mínimas existem no engine para impedir reintrodução de lógica geométrica autoritativa no frontend.
- **Regra anti-regressão (overlays/tools):** Após a migração, overlays/tools não podem reintroduzir geometria autoritativa em JS; isso é enforced por gate de CI/review (imports proibidos de “shape geometry” fora do engine; ver PR-05/Test Plan).
- **Gate de performance formal:** Em docs grandes, `updateTransform` não pode causar rebuild global de buffers por frame. O caminho interativo deve ser incremental e _mínimo viável_: (a) transform-only em `updateTransform` para transforms rígidas; (b) retesselação apenas no commit; (c) vertex drag retessela só a entidade dirty (nunca o documento inteiro).

## 2. Estado Atual (AS-IS) — resumo factual

- Autoridade do documento ainda vive no React/Zustand (shapes/layers/z-order/undo/redo/persistência).
- Engine já domina picking (`pickEx`) e interaction sessions (`begin/update/commit/cancelTransform`) e renderiza via buffers WASM→WebGL2.
- Sync ainda existe no modelo reativo Store→Engine (`useEngineStoreSync` com Upsert/Delete/DrawOrder).
- Não há mais JS-fallbacks ativos para picking/move/resize/vertex drag (assumido como verdade), mas ainda existe shadow-state estrutural (engine ≠ store) enquanto o documento canônico estiver no store.

## 3. Arquitetura Alvo (TO-BE) — contratos e fluxos

### 3.1 Data Flow

- **Engine (SoT):** `DocumentState` contém:
  - `EntityStore` (records por tipo), `LayerStore`, `DrawOrder/Z`, `EntityFlags`, `SelectionState`, `TextStore`, `History`, `NextId`, `Generations`.
- **Frontend (não SoT):** mantém apenas `UIState`:
  - tool state, viewport/câmera, modais/painéis, preferências, estado IME/TextInputProxy, pointer capture/hover, flags de UX.
  - qualquer cache “document view” é derivado e invalidado por `docGeneration`/eventos (nunca autoritativo).

### 3.2 Command Flow

- **UI → Engine (Commands/Intents):**
  - Seleção: `PickSelect`, `SetSelection`, `ClearSelection`, `MarqueeSelect`.
  - Transform sessions: `BeginTransform`, `UpdateTransform`, `CommitTransform`, `CancelTransform`.
  - Documento: `Create*`, `DeleteEntities`, `SetEntityProps` (estilo/flags/layer), `ReorderEntities`, `SetLayerProps`.
  - Texto: `UpsertText`, `InsertText`, `DeleteTextRange`, `SetTextSelection`, `ApplyTextStyle`, `SetTextAlign`, `SetTextConstraint`.
  - Histórico: `Undo`, `Redo`, `SetHistoryLimit`, `ClearHistory`.
- **Engine → UI (Events + Queries):**
  - Engine emite eventos/deltas após cada mutação relevante.
  - UI consome eventos e reconstrói overlays/painéis via queries pontuais (O(k) onde k = seleção/entidades afetadas).

### 3.3 Snapshot/Event Model

- **Gerações (obrigatórias e distintas):**
  - `docGeneration` (qualquer mutação do documento),
  - `renderBufferGeneration` (mudança efetiva nos buffers consumidos pelo WebGL, inclusive durante interação),
  - `selectionGeneration`, `historyGeneration`, `textGeneration` (global e/ou por textId).
- **Event Queue (obrigatória, bounded):**
  - Formato fixo/compacto + `changeMask` para coalescing.
  - Regra dura: **event overflow = full resync** (sem “corrigir” por JS).
- **Queries mínimas obrigatórias para UI (para eliminar geometria JS):**
  - `getEntityAabb(id)`
  - `getSelectionOutline()` (ou batch por seleção atual)
  - `getSelectionHandles()` (ou `getHandles(ids)`; posições em world)
  - `getSelectionIds()`
  - Texto: `getTextBounds(textId)`, `getTextCaretQuad(textId)`/`getTextCaretPosition(textId)`, `getTextSelectionRects(...)`
  - Opcional (se houver UX): `getStrokePreview(...)`/`getOutlineStroke(...)` como primitivo de overlay em world.

### 3.3.1 UI Update Contract (mínimo garantido; UI nunca reconstrói documento)

- **Canal primário (quando habilitado):** `pollEvents(max)` (controlado por `ProtocolInfo.featureFlags`) entrega eventos e pode sinalizar `EVENT_OVERFLOW`.
- **Canal de fallback obrigatório:** `getDocumentSnapshotMeta()` / `getFullSnapshotMeta()` (sempre disponível no baseline engine-first) entrega snapshot completo do estado canônico para bootstrap e full resync.
- **Leituras pontuais:** queries mínimas (outline/handles/aabb/text) são consideradas leituras canônicas do documento; a UI não recalcula geometria do documento a partir de modelos locais.
- **Regra dura:** `EVENT_OVERFLOW` ⇒ full resync por snapshot (sem “corrigir” por JS). Falta de capability requerida (feature flag ausente) ⇒ bloquear explicitamente (“engine incompatível”), nunca degradar silenciosamente.

### 3.4 Persistence Model

- **Arquivo (container binário):** tabela de seções + CRC por seção.
- **Seção obrigatória:** `ESNP` = snapshot completo do documento do engine (versão vNext).
- **Seções opcionais:** `META` (viewport/tool), `SETT` (preferências). Histórico persistido é política de produto; o modelo engine-first não depende disso.
- **Regra dura:** após `engine.loadSnapshot(...)`, o renderer consome **apenas** estado interno do engine. Não existe “reaplicar por JS” nem repopular via store/sync.

### 3.5 Undo/Redo Model

- **Modelo obrigatório:** histórico baseado em **comandos reversíveis** com payload mínimo (não snapshots completos por padrão).
  - Cada comando aplicado gera seu inverso (ou gera “before-state minimal set” para reversão determinística).
  - Uma `TransformSession` commitada vira 1 entry atômica contendo os inversos por entidade afetada.
- **Opcional obrigatório para escala:** checkpoint snapshot a cada `N` entries (configurável) para acelerar undo em documentos enormes:
  - Checkpoint = snapshot completo do engine + truncamento/compaction controlado.
  - Regra: checkpoint nunca vira fonte de verdade no frontend; é mecanismo interno do engine.

### 3.6 ID Model

- `EntityId` é alocado pelo engine e persistido no snapshot.
- JS usa `EntityId` como key e referência; não há `IdRegistry` autoritativo.
- Em migração, qualquer mapeamento temporário JS→id é derivado e removível; o engine continua sendo o dono do namespace.

### 3.7 ABI/Protocol Model

- **Handshake obrigatório:** `ProtocolInfo` exposto pelo engine e validado no startup.
- `ProtocolInfo` inclui:
  - versões: `protocolVersion`, `commandVersion`, `snapshotVersion`, `eventStreamVersion`
  - `abiHash` (hash de enums/opcodes/sizeof/offsetof structs públicas)
  - **featureFlags (bitmask)**: capabilities opcionais compiladas no WASM (`FEATURE_EVENT_STREAM`, `FEATURE_SNAPSHOT_VNEXT`, `FEATURE_QUERY_HANDLES`, `FEATURE_QUERY_SELECTION_OUTLINE`, etc.).
- Regra: o frontend decide fluxo por `featureFlags`, não por “typeof func”.
- Regra (rollout): o frontend declara um `requiredFeatureFlags` (baseline mínimo do build). Se o handshake não satisfaz esse baseline, o app **bloqueia explicitamente** (“engine incompatível” + flags requeridas vs fornecidas). Não existe fallback silencioso.
- Baselines por etapa/PR: definidos em **Apêndice A1** e tratados como contrato de compatibilidade (baseline mínimo requerido pelo frontend daquele PR).

## 4. Plano por Etapas (PR-01, PR-02, ...)

### PR-01 — Protocol Handshake (fail-fast) + FeatureFlags + EntityId primário

Objetivo:

- Criar o “pino de segurança” (compatibilidade explícita) e garantir que a UI opere em torno de `EntityId` e `featureFlags`, eliminando detecção por ausência de métodos.

Escopo:

- Infra apenas: handshake, enums/bitmasks, tipos e validação. Sem migrar persistência nem remover store.

Mudanças (arquivos/módulos):

- C++: `getProtocolInfo()` exposto via bindings; `ProtocolInfo` contendo versões, `abiHash` e `featureFlags`.
- TS: validação de handshake no `EngineRuntime.create()`; tipos `EntityId` e `EngineFeatureFlags`.
- UI: `PickResult`/seleção/commit passam a trafegar `EntityId` como identidade primária (não strings).

Contratos TS↔WASM:

- Struct `ProtocolInfo` (POD, campos u32) e enum `EngineFeatureFlags` (bitmask).
- Definição formal de versionamento e `abiHash` (o que entra no hash e como é calculado).
- Nota PR-01: `ProtocolInfo` usa `protocolVersion=1`, `commandVersion=2`, `snapshotVersion=3`, `eventStreamVersion=1`; `REQUIRED_FEATURE_FLAGS = FEATURE_PROTOCOL`.

Critérios de Aceite:

- Teste TS: mismatch de `protocolVersion`/`abiHash` bloqueia inicialização com erro explícito.
- Teste TS: se `(engine.featureFlags & requiredFeatureFlags) !== requiredFeatureFlags`, bloquear com tela/erro “engine incompatível” (inclui required vs provided), sem tentar degradar por `typeof`.
- Manual: UI não faz “feature detection por typeof”; fluxo baseado em `featureFlags`.

Riscos & Mitigação:

- Risco: incompatibilidade com builds antigos → mitigação: política explícita de versão (build antiga não é suportada).

Rollback:

- Reverter para um par WASM+TS compatível (mesmo `protocolVersion` e baseline de flags atendido). Não existe bypass de handshake como estratégia de rollback.

### PR-02A — Layers + flags (visible/locked) engine-authoritative (aplicação em pick/render)

Objetivo:

- Migrar `LayerStore` e `EntityFlags` (visible/locked) para o engine e tornar essas regras **nativas** do pick e do render (sem filtragem JS).

Escopo:

- Engine mantém layers e flags; pickEx e render respeitam `visible/locked` do engine.
- Frontend passa a exibir/editar layers via comandos/queries do engine (Zustand mantém apenas preferências de UI).

Mudanças (arquivos/módulos):

- C++: `LayerStore`, `EntityFlags`, integração no document state; aplicação no pick (pickability) e no render (visibilidade).
- TS/UI: APIs e UI para listar/editar layers e flags via engine (sem store autoritativo).

Contratos TS↔WASM:

- `LayerRecord` snapshot + eventos `LAYER_CHANGED`/`ENTITY_FLAGS_CHANGED`.

Critérios de Aceite:

- Manual: `visible/locked` impacta pick e beginTransform diretamente (sem lógica JS).
- Testes C++: pickEx ignora entidades invisíveis/locked e o render não desenha entidades invisíveis.

Riscos & Mitigação:

- Risco: duplicação temporária (store ainda guarda layers) → mitigação: engine-wins; store vira UI-only.

Rollback:

- Feature flag `ENGINE_LAYER_FLAGS_AUTHORITY` (engine-wins vs legado) por período curto.

### PR-02B — SelectionState + DrawOrder authority (engine-owned)

Objetivo:

- Migrar seleção e ordenação (draw order/z) para o engine para remover as duas últimas “autoridades invisíveis” do frontend no pipeline de interação.

Prerequisite:

- PR-02A concluído (flags/layers já engine-authoritative), para evitar regras de pick/selection residuais no JS.

Escopo:

- Engine mantém `SelectionState` e `DrawOrder` e os usa como fonte canônica para: (a) operações de transformação multi-seleção, (b) prioridade de picking/z, (c) render ordering.
- Frontend trata seleção como UI refletida (consome via eventos/queries), não como conjunto autoritativo em store.

Mudanças (arquivos/módulos):

- C++: `SelectionState`, `DrawOrder` canônicos, integração com pick/transform/render.
- TS/UI: comandos de seleção/reorder chamam engine; UI consome `getSelectionIds()`/snapshots/eventos.

Contratos TS↔WASM:

- APIs: `setSelection/getSelection`, `setDrawOrder/getDrawOrder` + eventos `SELECTION_CHANGED`, `ORDER_CHANGED`.

Critérios de Aceite:

- Manual: seleção (inclusive marquee) e draw order funcionam após reload via snapshot sem store; beginTransform usa seleção do engine.
- Testes C++: `DrawOrder` e `SelectionState` persistem no snapshot e influenciam pick/render de forma determinística.

Riscos & Mitigação:

- Risco: UI ainda depende de seleção local para overlays → mitigação: overlays passam a consultar seleção/handles/outlines via engine (alinhado com PR-05).

Rollback:

- Feature flag `ENGINE_SELECTION_ORDER_AUTHORITY` por período curto.

### PR-03 — Snapshot vNext completo (ESNP) + Render Source-of-Truth (engine-only após load)

Objetivo:

- Garantir persistência engine-first e impedir o cenário híbrido “carrega snapshot mas JS re-upsert sobrescreve”.

Escopo:

- Implementar snapshot completo do documento (layers, entidades, flags, draw order, seleção, texto, nextId).
- Declarar e aplicar regra: **renderer consome somente o estado interno do engine após `loadSnapshot()`**.

Mudanças (arquivos/módulos):

- C++: `DocumentSnapshot vNext` + `loadDocumentSnapshotFromPtr()` + `getDocumentSnapshotMeta()`.
- TS: persistência salva `ESNP` obrigatório; abrir arquivo faz `engine.loadSnapshot` e **não** executa re-sync Store→Engine.
- UI: ao abrir snapshot, desabilitar qualquer “reaplicação” (sync, re-upserts, reconstrução parcial).

Contratos TS↔WASM:

- Snapshot header + version + CRC + seções mínimas (`LAYR/ENTS/ORDR/SELC/TEXT/NIDX`).
- Metadados que garantem determinismo (ordem, contagens, etc.).

Critérios de Aceite:

- **Gate hard (PR-03):** PR-03 não fecha sem `engine.getDocumentDigest()` + teste `save → load → save` com digest idêntico.
- C++: snapshot roundtrip determinístico **semanticamente** para um doc com mix de entidades/layers/texto:
  - invariantes: contagens, IDs, geometria, draw order, layers, selection, `nextId` preservados;
  - `engine.getDocumentDigest()` (hash canônico) é idêntico em save→load→save.
  - **Não-gate:** byte-equivalente. Isso só é exigido se o snapshot for explicitamente canonicalizado: coleções serializadas em ordem de `EntityId` crescente e floats normalizados; sem timestamps/padding/ordem de hashmap.
- Manual: “Save → Reload (F5) → Open” restaura documento correto sem depender de JSON/Store.
- Regra de render: após load, render correto sem qualquer “reapply” por JS (com prova via logs/flags de debug).

Riscos & Mitigação:

- Risco: coexistência com formatos legados → mitigação: import legado separado, nunca usado como load autoritativo.

Rollback:

- Manter export/import legado como opção paralela (não default) até estabilizar.

### PR-04 — Event Stream Engine→UI + regra dura de Overflow = Full Resync

Objetivo:

- Trocar o modelo reativo Store→Engine por um modelo event-driven Engine→UI (UI como consumer).

Escopo:

- Implementar fila de eventos bounded; UI consome e reconstrói caches/overlays por queries.
- Regra dura: overflow = full resync via snapshot completo do engine.
- Requisito mínimo: coalescing obrigatório por `(entityId, changeMask)` e publicação em batches por tick/frame (evitar flood por input/typing).

Mudanças (arquivos/módulos):

- C++: `EventQueue` + APIs `pollEvents()` e `getFullSnapshotMeta()` (snapshot de estado atual).
- TS/UI: hook `useEngineEvents()`; ao detectar overflow, executar full resync sem heurística JS.

Contratos TS↔WASM:

- `Event` struct fixo + `EventType` enum + `changeMask`.
- `EVENT_OVERFLOW` sem payload ambíguo.

Critérios de Aceite:

- Manual: induzir overflow (modo debug) e observar full resync correto (documento/overlays coerentes).
- Teste TS: overflow sempre força snapshot; UI não tenta “corrigir incrementalmente”.

Riscos & Mitigação:

- Risco: excesso de eventos → mitigação: coalescing no engine por id/changeMask; batch por frame.

Rollback:

- Feature flag para desligar event stream e voltar temporariamente ao polling de snapshots (sem reintroduzir store como SoT).

### PR-05 — Command Pattern real + Overlay Query Surface (sem geometria JS) + Gate de Performance Interativa

Objetivo:

- Fechar o ciclo interativo engine-first (UI manda intents; engine muda estado; UI desenha/consulta).
- Eliminar o “buraco dos overlays” quando `useDataStore.shapes` deixar de existir.
- Formalizar e atender o requisito de performance em interação (sem rebuild global por frame).

Escopo:

- Criar/editar/deletar/reordenar via comandos do engine (incluindo criação com IDs gerados no engine).
- Implementar queries mínimas para overlays e propriedades (world-space).
- Implementar caminho interativo incremental: `updateTransform` não pode forçar rebuild global de buffers por frame em docs grandes.

Mudanças (arquivos/módulos):

- C++:
  - APIs de criação/edição (retornam `EntityId`).
  - Queries de overlay: `getSelectionOutline()`, `getSelectionHandles()`, `getEntityAabb(id)` e texto caret/bounds.
  - Render (estratégia mínima, não-research):
    - `updateTransform`: **transform-only** para transforms rígidas (matriz/tx-ty-scale por entidade em buffer próprio consumido no shader); sem retesselação global.
    - `commitTransform`: materializa/aplica transform no estado canônico e permite retesselação quando necessário (ex.: mudanças topológicas), gerando histórico.
    - `VertexDrag`/polylines: retesselar **somente** a entidade dirty e patchar ranges/streams; nunca rebuild do documento inteiro no loop interativo.
- TS/UI:
  - Substituir dependências de geometria JS para overlays por queries do engine.
  - Remover qualquer aplicação autoritativa de diffs em shapes locais; UI reage a eventos.

Contratos TS↔WASM:

- `OverlayPrimitive` stream (formato fixo): outlines (polyline/polygon/segment/rect corners), handle points, text caret quad/selection rects.
- Semântica de `renderBufferGeneration`: incrementa sempre que o conteúdo consumido pelo WebGL muda (inclui interação).

Critérios de Aceite:

- Overlays: SelectionOverlay/handles/caret funcionam sem acessar shapes no store (somente engine queries).
- Engine-first: criação/edição não depende de `useEngineStoreSync` nem de store autoritativo.
- Anti-regressão (sem geometria JS autoritativa):
  - Overlays/tools não podem importar módulos de “shape geometry” do frontend (ex.: helpers que recebem `Shape` e computam bounds/handles/selection window/crossing). Eles só podem importar matemática de viewport (screen↔world, world↔screen) e consumir outlines/handles vindos do engine.
  - Gate de CI: check estático (grep/AST) falha se arquivos em `features/**/Overlay*`, `features/**/Interaction*`, `features/**/use*Interaction*` importarem módulos proibidos (ex.: `@/utils/geometry` quando este contiver shape-geometry; `isShapeInSelection`, `getShapeHandles`, `getShapeBoundingBox`, etc.).
  - Para tornar o gate objetivo, separar explicitamente “viewport math” (permitido) de “shape geometry” (proibido) em módulos distintos.
- Performance gate (definido e medido):
  - Documento benchmark A (ex.: 50k entidades simples) e benchmark B (ex.: 200k segmentos em polylines).
  - Durante `updateTransform` (move/resize/vertex drag), não ocorre rebuild global; custo por frame escala com k (seleção) e não com N (documento).
  - Critério objetivo: durante drag, o caminho de rebuild global (equivalente a “rebuild all geometry buffers”) não é executado por frame; apenas updates incrementais ocorrem (validável via contador/debug flag/telemetria do engine).
  - Target: manter interação estável (ex.: ≥60fps em máquina de referência; ou ≤X ms CPU/frame no engine + upload incremental).

Riscos & Mitigação:

- Risco: UI tentar recomputar geometria por falta de query → mitigação: bloqueio explícito no review (nenhuma util de geometria para overlays sem passar pelo engine).
- Risco: incremental render complexo → mitigação: fallback explícito: se operação estrutural ocorrer, rebuild total permitido; em interação, incremental obrigatório.

Rollback:

- Feature flag `ENGINE_COMMANDS_AUTHORITATIVE` e `ENGINE_OVERLAY_QUERIES` para voltar ao caminho anterior por uma release (sem remover o objetivo final).

### PR-06 — Undo/Redo Engine-owned (command-based) + checkpoints opcionais

Objetivo:

- Remover o store como adaptador de histórico e consolidar undo/redo no engine.

Escopo:

- History no engine com comandos reversíveis e payload mínimo.
- Checkpoint snapshots a cada N entries (opcional) para escala.

Mudanças (arquivos/módulos):

- C++: `History` integrado a todos os comandos e commits de transform/text.
- TS/UI: botões/shortcuts chamam `engine.undo/redo`; UI só reflete estado por eventos.

Contratos TS↔WASM:

- `getHistoryMeta()` + evento `HISTORY_CHANGED`.

Critérios de Aceite:

- Manual: create→transform→delete→undo→redo funciona sem qualquer patch autoritativo no Zustand.
- C++: teste de roundtrip de history + snapshot.

Riscos & Mitigação:

- Risco: inversos incompletos → mitigação: para cada comando, contrato de inversão obrigatório e testado.

Rollback:

- Dual-run temporário (engine history + store history) por feature flag, com engine como fonte de verdade.

### PR-07 — Remover Zustand como documento (store vira UI-only)

Objetivo:

- Eliminar shadow state definitivamente: o store não contém mais shapes/layers/history como verdade.

Escopo:

- Remover `useDataStore` como store de documento e remover `useEngineStoreSync`.
- Regra final (anti-regressão): após PR-07, `useEngineStoreSync` é **deletado** (arquivo removido). Se algum código tentar reintroduzir/consumir sync autoritativo, isso deve falhar em build/CI, não “virar no-op”.
- Manter explicitamente um **UI store** (não documento) para evitar regressão de UX.
- Introduzir (opcional) um `DocumentViewCache` derivado (não autoritativo) para evitar “WASM call por pixel”: cache por geração, bounded, invalidado por `docGeneration`/events; nunca usado como fonte de verdade.

Mudanças (arquivos/módulos):

- TS/UI:
  - Estado mantido no UI store (obrigatório): tool state, viewport/câmera, modais/painéis, preferências, estado IME/TextInputProxy, pointer/hover/capture, flags de UX.
  - Selection/layers/history/document state vêm do engine (queries/events).
- Remover mapeamentos JS autoritativos de ID (IdRegistry) e adotar `EntityId` end-to-end.

Contratos TS↔WASM:

- Queries e eventos já implementados nas PRs anteriores devem cobrir 100% do que a UI desenha/exibe.

Critérios de Aceite:

- Build roda sem `useDataStore.shapes/layers/past/future` e sem `useEngineStoreSync` (zero referências; arquivo removido).
- Manual: workflows principais (draw/select/transform/text/undo/redo/save/open) operam com o engine como SoT.

Riscos & Mitigação:

- Risco: regressão de UX por falta de estado de UI → mitigação: UI store explicitamente preservado e testado.

Rollback:

- Reverter para o último PR antes da remoção (rollback completo do store de documento).

### PR-08 — Persistência Engine-only (default) + prova final (save/reload/open)

Objetivo:

- Fechar o gate: demonstrar que o engine é a única fonte de verdade do documento em runtime e persistência.

Escopo:

- `ESNP` obrigatório no save/open.
- PROJ/JSON apenas como import legado (se necessário), fora do caminho principal.

Mudanças (arquivos/módulos):

- TS/UI: salvar e abrir exclusivamente por snapshot do engine + meta opcional de UI.
- Documentos legados: pipeline de import (one-way) para snapshot vNext.

Contratos TS↔WASM:

- Snapshot vNext final versionada e validada por handshake.

Critérios de Aceite:

- Procedimento de prova (Seção 6) passa integralmente.

Riscos & Mitigação:

- Risco: compatibilidade com versões antigas → mitigação: import separado, com validação e migração determinística.

Rollback:

- Manter export legado como ferramenta (não fluxo padrão) por período limitado.

## 5. Test Plan (gate final)

- testes automatizados necessários
  - C++:
    - Snapshot vNext determinístico semanticamente (invariantes + `engine.getDocumentDigest()` estável em save→load→save).
    - pickEx respeita flags/selection/layers sem JS.
    - overlay queries (outline/handles/aabb) corretas por tipo.
    - undo/redo: sequência de comandos + reversão total + equivalência de snapshot.
    - event stream: coalescing + overflow sinalizado corretamente.
    - protocol/abi: `ProtocolInfo` consistente e hash estável.
  - TS/Vitest:
    - handshake fail-fast.
    - overflow => full resync (sem tentativa incremental).
    - renderBufferGeneration: renderer reupload somente quando necessário (sem “stale buffer”).
    - UI integration: seleção/overlays/painéis usam queries do engine (sem store de shapes).
    - Anti-regressão overlays/tools: check estático (grep/AST) bloqueia imports proibidos de “shape geometry” após PR-05 (permitido apenas “viewport math”).
- testes manuais necessários
  - Criação/edição completa: draw→select→move/resize/vertex→text edit→undo/redo→save→reload→open.
  - Layers: visible/locked impacta pick/transform.
  - Overlays: handles/outline/caret/selection rects coerentes em zoom/pan.
- métricas/perf gates
  - Benchmark A/B definidos (docs grandes). Coletar:
    - FPS médio/min em interação.
    - tempo CPU engine por frame durante `updateTransform`.
    - bytes upload GPU/frame (incremental vs full).
  - Fail do gate se `updateTransform` causar rebuild global per-frame em docs grandes.

## 6. Prova Final de Engine-First

Checklist objetiva (3 checks “gateáveis”):

**Check 1 — Persistência (`ESNP`)**

- “Save” gera arquivo contendo `ESNP` (snapshot vNext do engine) e **não** contém JSON autoritativo de documento.
- Se existir JSON/blocos legados no arquivo: `Open` deve **ignorar** explicitamente (log/telemetria) e o documento final deve vir do `engine.loadSnapshot(...)`.

**Check 2 — SoT (Zustand sem documento)**

- Rodar build com document store desabilitado (somente UI store) e passar o fluxo completo: `create → edit → undo → save → reload → open`, com pick/transform/text/overlays funcionais.

**Check 3 — Determinismo (Digest)**

- `engine.getDocumentDigest()` idêntico em `save → load → save` e invariantes iguais: contagens por tipo, IDs, `nextId`, layers, draw order e selection (se persistida).

## Apêndice A — Ajustes Finais Obrigatórios (Normativo)

### A1. Baseline de Capabilities por Etapa (Required Feature Flags)

Cada PR define explicitamente o conjunto mínimo de capabilities do engine que o frontend exige para rodar. Se o handshake não satisfizer o baseline, o app **bloqueia** com erro explícito (“engine incompatível”).

| PR     | requiredFeatureFlags                                                                 |
| ------ | ------------------------------------------------------------------------------------ |
| PR-01  | `FEATURE_PROTOCOL`                                                                   |
| PR-02A | `FEATURE_PROTOCOL \| FEATURE_LAYERS_FLAGS`                                           |
| PR-02B | `FEATURE_PROTOCOL \| FEATURE_LAYERS_FLAGS \| FEATURE_SELECTION_ORDER`                |
| PR-03  | `FEATURE_PROTOCOL \| FEATURE_SNAPSHOT_VNEXT`                                         |
| PR-04  | `FEATURE_PROTOCOL \| FEATURE_EVENT_STREAM`                                           |
| PR-05  | `FEATURE_PROTOCOL \| FEATURE_OVERLAY_QUERIES \| FEATURE_INTERACTIVE_TRANSFORM`       |
| PR-06  | `FEATURE_PROTOCOL \| FEATURE_ENGINE_HISTORY`                                         |
| PR-07  | `FEATURE_PROTOCOL \| FEATURE_ENGINE_DOCUMENT_SOT`                                    |
| PR-08  | `FEATURE_PROTOCOL \| FEATURE_ENGINE_DOCUMENT_SOT \| FEATURE_PERSISTENCE_ENGINE_ONLY` |

Regra dura:

- **Nunca** inferir capability por `typeof`, try/catch, “func existe”, ou fallback silencioso.
- Apenas `ProtocolInfo.protocolVersion` + `ProtocolInfo.featureFlags` governam compatibilidade.
- Falta de flag requerida ⇒ **hard block**.

Definição (capability) — `FEATURE_ENGINE_DOCUMENT_SOT`:

- “Engine Document SoT” significa: (1) **não existe store de documento ativo no frontend**; (2) **todas** as mutações do documento passam por comandos para o engine; (3) `loadSnapshot`/render/pick operam **somente** sobre o estado interno do engine (sem re-upsert/sync).

---

### A2. Document Digest Obrigatório (Snapshot vNext)

A partir do PR-03, o engine deve expor um digest canônico do documento.

API obrigatória:

```cpp
DocumentDigest getDocumentDigest();
```

Propriedades do digest:

- Determinístico semanticamente.
- Independe de viewport, tool ativa e meta de UI.
- Inclui: entidades (IDs, tipo, geometria, estilo), layers, draw order, flags, seleção (se persistida), texto (conteúdo + layout state) e `nextId`.

Uso obrigatório (gate):

- `save → load → save ⇒ digest idêntico` (hard gate do PR-03 e do gate final).
- Byte-equivalência **não** é exigida; apenas equivalência semântica (ver PR-03).

---

### A3. Regra Formal do Renderer (Transform-Only em Interação)

A partir do PR-05, o renderer deve obedecer estritamente às regras abaixo.

Durante `updateTransform`:

- PROIBIDO: retesselar entidades; rebuild global de buffers.
- PERMITIDO: aplicar transformações via buffer de transforms por entidade (matriz/tx-ty/scale/rotation) consumido no shader.

Durante `commitTransform`:

- PERMITIDO: materializar/bake e retesselar **apenas** entidades dirty (e só quando necessário), gerando histórico.

Gate de performance:

- Em docs grandes, durante drag/resize/vertex-drag: nenhuma chamada equivalente a “rebuild all geometry buffers” por frame (validável por contador/telemetria).

---

### A4. Regra Anti-Geometria-JS (Enforcement Estrutural)

Após PR-05, o frontend não pode conter geometria autoritativa do documento.

Proibição absoluta (frontend):

- Calcular handles/outlines/bounds de entidades.
- Decidir selection window/crossing e interseções geométricas de shapes.

Origem permitida:

- Queries do engine.
- Viewport math (screen↔world).

Gate de CI/review:

- Check estático falha se arquivos em `features/editor/**`, `components/**Overlay**`, `hooks/**Interaction**`, `snapEngine/**` (e novos módulos nesses domínios) importarem “shape geometry” proibida.
- Estrutura obrigatória: `viewportMath/*` permitido; `shapeGeometry/*` proibido fora do engine.

---

### A5. Regra de Governança Final (Humana)

Toda feature nova que lê/modifica/interpreta o documento deve ser implementada primeiro no engine. Qualquer PR que:

- introduza estado de documento no JS,
- reintroduza geometria autoritativa no frontend,
- burle `featureFlags`/handshake,
  ⇒ rejeitado sem exceção.

# LAST_ADJUSTMENTS_PATCH.md (últimos ajustes)

> Aplicar estes ajustes no `ENGINE_fIRST_MASTER_PLAN.md`. Depois disso: **congelar o plano** (qualquer mudança vira “novo plano”, não adendo).

---

## 1) Corrigir nomenclatura (“Normas normativas” → “Normas (Apêndice A)”)

Substituir no topo:

- **Antes:** **Normas normativas (Apêndice A):** ...
- **Depois:** **Normas (Apêndice A — Gate):** este documento inclui A1–A5 (...) Esses itens são **gates** e não podem ser relaxados.

Motivo: remover redundância e deixar o status “Gate” explícito.

---

## 2) Tornar `requiredFeatureFlags` uma constante do build (e não “config” runtime)

Adicionar na seção **3.7 ABI/Protocol Model** (ou A1) este trecho:

- **Regra (build):** `requiredFeatureFlags` é compilado/embutido no frontend por release/PR (ex.: constante exportada), não vindo de config remota nem localStorage.
  - Permitido: build variants (`ENGINE_STAGE=PR-03`) que selecionam o baseline.
  - Proibido: “trocar flags” para rodar com engine incompleto.

Motivo: sem isso alguém “desliga baseline” e volta o híbrido.

---

## 3) Hard gate PR-07: CI deve falhar se `useEngineStoreSync` existir (arquivo ou símbolo)

Você já escreveu “removido do codebase”, mas falta o **mecanismo**. Adicionar em PR-07 (Critérios de Aceite) e em A4 (Gate CI) mais uma linha:

- **Gate CI adicional (PR-07+):**
  - Falhar o build se:
    - existir arquivo `useEngineStoreSync.ts` (ou path equivalente), **OU**
    - existir qualquer import que contenha `useEngineStoreSync` (string match / AST).
  - Resultado esperado: impossibilidade de reintroduzir “sync” por acidente.

Motivo: torna a regra “deletado” executável.

---

## Encerramento

Com estes 3 ajustes:

- baselines viram contrato de build (não bypassável),
- PR-07 vira irreversível por CI,
- e o texto fica limpo e sem ambiguidade.

**Fim.**
