1. Executive Summary
- Notas (0-10)
  - Arquitetura: 5/10
  - Correcao Geometrica: 4/10
  - Handlers & Cursores: 4/10
  - Determinismo: 6/10
  - Performance: 5/10
  - Testabilidade: 6/10
- Top 10 riscos (severidade/impacto)
  1) High: Handles/outline de selecao rotacionada nao batem com hit-test (AABB + rotacao no frontend) -> usuario ve handles em posicao errada e nao consegue pegar. Evidencia em `frontend/features/editor/components/ShapeOverlay.tsx:75` + `cpp/engine/impl/engine_overlay.cpp:139` + `cpp/engine/interaction/pick_system.cpp:318` + `cpp/engine.cpp:469`.
  2) High: Multi-select resize usa handle do bbox do grupo, mas engine redireciona para `selection.front()` e `beginTransform` (Resize) opera apenas no specificId -> redimensiona so o primeiro item. Evidencia em `cpp/engine.cpp:469`, `cpp/engine/interaction/interaction_session.cpp:226`, `frontend/features/editor/components/ShapeOverlay.tsx:147`.
  3) High: Side-resize e client-rotate fazem calculo geometrico no JS e chamam `setEntity*` por frame, quebrando Engine-First e gerando historico por frame. Evidencia em `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:508` + `cpp/engine/impl/engine_query.cpp:521`.
  4) High: Client-rotate usa `setEntityRotation` (com `beginHistoryEntry`/`commitHistoryEntry`) e depois `CommitDraft` -> undo/redo fica granular e possivelmente incorreto. Evidencia em `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:601` + `cpp/engine/impl/engine_query.cpp:569`.
  5) Medium: Mapeamento de indices de handle para angulo de cursor esta inconsistente com a ordem do engine (0=BL,1=BR,2=TR,3=TL). Evidencia em `frontend/features/editor/config/cursor-config.ts:121` e `cpp/engine/impl/engine_overlay.cpp:142`.
  6) Medium: Rotate handle existe no pick, mas nao e desenhado no overlay, criando interacao invisivel. Evidencia em `cpp/engine/interaction/pick_system.cpp:111` e ausencia em `frontend/features/editor/components/ShapeOverlay.tsx`.
  7) Medium: EdgeDrag para polyline promete mover segmento, mas engine trata como Move (desloca toda a polyline). Evidencia em `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:326` e `cpp/engine/interaction/interaction_session.cpp:491`.
  8) Medium: Rotacao usa delta normalizado em [-180,180] (engine e client) -> salto ao cruzar limite. Evidencia em `cpp/engine/interaction/interaction_session.cpp:925` e `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:608`.
  9) Medium: Selection toggle com Ctrl/Meta em click nao esta implementado (comentado), divergindo do SelectionManager. Evidencia em `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:276` e `cpp/engine/entity/selection_manager.cpp:81`.
  10) Medium: Hot path aloca arrays e re-renderiza React por pointermove (contra regra de hot path). Evidencia em `frontend/engine/core/runtime/SelectionSystem.ts:12` e `frontend/features/editor/interactions/useInteractionManager.ts:37` + `SelectionHandler.notifyChange()`.
- Top 10 pontos fortes
  1) Pick system em C++ com prioridade por subTarget e z-order (boa base para determinismo). Evidencia `cpp/engine/interaction/pick_system.h:58`.
  2) Handles de rotacao e resize no pick com offset/raio em screen-space (UX consistente com zoom). Evidencia `cpp/engine/interaction/pick_system.cpp:111`.
  3) Transform session com drag threshold e cancel/commit coerentes (descarta se nao drag). Evidencia `cpp/engine/interaction/interaction_session.cpp:468` e `cpp/engine/interaction/interaction_session.cpp:1056`.
  4) Axis lock e snap integrado no engine (Shift para axis lock, Ctrl/Meta para suprimir snap). Evidencia `cpp/engine/interaction/interaction_session.cpp:491` e `cpp/engine/interaction/interaction_session.cpp:21`.
  5) Snap guides renderizados via overlay do engine, com testes. Evidencia `cpp/tests/overlay_query_test.cpp:54` e `frontend/features/editor/components/ShapeOverlay.tsx:105`.
  6) Testes de regressao para handles de elipse rotacionada. Evidencia `cpp/tests/engine_test.cpp:1014`.
  7) Testes de determinismo de snapshot. Evidencia `cpp/tests/determinism_test.cpp:1`.
  8) Unit tests para geometria de side-resize (JS) com casos de flip e simetria. Evidencia `frontend/features/editor/interactions/handlers/sideResizeGeometry.test.ts:1`.
  9) Pipeline de eventos centralizado (InteractionManager) com hooks de ciclo de vida. Evidencia `frontend/features/editor/interactions/useInteractionManager.ts:87`.
  10) Pointer capture no layer de interacao garantindo drag fora do canvas. Evidencia `frontend/features/editor/components/EngineInteractionLayer.tsx:103`.

2. System Map (Handlers & Interactions)
- Arquivos e simbolos principais
  - Frontend core
    - `frontend/features/editor/components/EngineInteractionLayer.tsx` (pointer capture, pan override, viewScale sync)
    - `frontend/features/editor/interactions/useInteractionManager.ts` (state machine de handlers)
    - `frontend/features/editor/interactions/BaseInteractionHandler.ts` (contrato)
    - `frontend/features/editor/interactions/handlers/SelectionHandler.tsx` (pick, transform, marquee, cursors)
    - `frontend/features/editor/interactions/handlers/DraftingHandler.tsx` (draft + drag thresholds)
    - `frontend/features/editor/interactions/handlers/TextHandler.tsx` (text pick/edition)
    - `frontend/features/editor/interactions/sideHandles.ts` + `.../handlers/sideResizeGeometry.ts`
    - `frontend/features/editor/components/ShapeOverlay.tsx` (selection/draft/snap overlay)
    - `frontend/features/editor/components/MarqueeOverlay.tsx` (marquee)
    - `frontend/features/editor/components/RotationCursor.tsx`, `ResizeCursor.tsx`
    - `frontend/features/editor/config/cursor-config.ts`
    - `frontend/features/editor/utils/interactionHelpers.ts` (isDrag)
  - Engine / C++
    - `cpp/engine/interaction/pick_system.h|cpp` (hit-test, prioridade)
    - `cpp/engine/interaction/interaction_session.h|cpp` (begin/update/commit transform, snapping)
    - `cpp/engine/impl/engine_overlay.cpp` (selection outline/handles)
    - `cpp/engine.cpp` (pickEx com selecao)
    - `cpp/engine/impl/engine_query.cpp` (getSelectionBounds, getEntityTransform, setEntity*)
    - `cpp/engine/entity/selection_manager.cpp`
  - Tests
    - `cpp/tests/engine_test.cpp` (rotated handles)
    - `cpp/tests/overlay_query_test.cpp`
    - `cpp/tests/determinism_test.cpp`
    - `frontend/tests/interactions/SelectionHandler.test.ts`
    - `frontend/tests/components/ShapeOverlay.test.tsx`
    - `frontend/features/editor/interactions/handlers/sideResizeGeometry.test.ts`

- Diagrama ASCII de dependencias
  [EngineInteractionLayer]
       | pointer events + setPointerCapture
       v
  [useInteractionManager] --(active tool)--> [SelectionHandler | DraftingHandler | TextHandler | PanHandler]
       |                                     |  (state machine local)
       |                                     v
       |                               [EngineRuntime]
       |                                     |
       |                                     v
       |                        [WASM CadEngine (C++)]
       |                             |      |      |
       |                             |   PickSystem | InteractionSession
       |                             |      |      |
       |                             +-- SelectionManager / EntityManager
       |
       v
  [ShapeOverlay] <--- overlay metas ---- (CadEngine getSelectionOutline/Handle/Snap)

- Pipeline completo de interacao
  raw input -> `EngineInteractionLayer` (pointer capture, pan override)
  -> `useInteractionManager.buildContext` (screenToWorld)
  -> `SelectionHandler.onPointerDown`
     -> tolerance em screen-space -> world
     -> `runtime.pickExSmart` (WASM) e opcional `findSideHandle` (JS)
     -> decide interacao (Move/Resize/Rotate/Vertex/Edge/Marquee)
     -> `runtime.beginTransform(...)` OR `side-resize`/`client-rotate` locais
  -> `onPointerMove`
     -> `runtime.updateTransform(...)` OR JS side-resize/client-rotate
  -> `onPointerUp`
     -> `runtime.commitTransform()` OR `CommitDraft`
  -> `ShapeOverlay` renderiza (selection/draft/snap overlays) via metas do engine

3. Handler Catalog (100% Coverage)
- Corners (Resize handle corners)
  - Draw: `ShapeOverlay` renderiza handles via `getSelectionHandleMeta()` + `renderPoints(..., applyRotation=true)` (single) ou bbox do grupo (multi). Evidencia `frontend/features/editor/components/ShapeOverlay.tsx:241`.
  - Hit-test: `CadEngine::pickEx` usa `getSelectionBounds()` para handles (AABB) e retorna ResizeHandle. Evidencia `cpp/engine.cpp:469`.
  - Cursor: `SelectionHandler.updateResizeCursor` usa `getResizeCursorAngle(hoverSubIndex)` e subtrai rotacao do entity. Evidencia `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:406`.
  - Interacao: `TransformMode.Resize` via `beginTransform`. Evidencia `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:285`.
  - Modifiers: Shift (aspect) no engine; Alt nao tratado no engine para resize; Ctrl/Meta suprime snap. Evidencia `cpp/engine/interaction/interaction_session.cpp:777` e `cpp/engine/interaction/interaction_session.cpp:21`.
  - Rotacao/Zoom: pick usa viewScale para rotation handles; overlay aplica rotacao no JS; tolerancia em 10px screen. Evidencia `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:216` e `cpp/engine/interaction/pick_system.cpp:111`.

- Edges (Side handles N/E/S/W)
  - Draw: nao desenhado no overlay (nenhuma representacao em `ShapeOverlay`).
  - Hit-test: `SelectionHandler.findSideHandle` em JS com tolerancia e exclusao de cantos. Evidencia `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:138`.
  - Cursor: `SelectionHandler` usa `getResizeCursorAngle` + 90 e subtrai rotacao. Evidencia `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:692`.
  - Interacao: `side-resize` local com `calculateSideResize` e `runtime.setEntitySize/Position/Scale`. Evidencia `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:508`.
  - Modifiers: Alt = simetrico (JS), Shift nao aplicado, Ctrl/Meta nao aplicado. Evidencia `SelectionHandler.tsx:520`.
  - Rotacao/Zoom: JS projeta ponto para local via rotacao; tolerancia em world. Evidencia `SelectionHandler.tsx:157`.

- Rotate handle
  - Draw: nao desenhado em `ShapeOverlay` (apenas bbox/handles). Evidencia `frontend/features/editor/components/ShapeOverlay.tsx`.
  - Hit-test: C++ `tryPickRotateHandleAabb/Rotated` com offset 15px e raio 10px em screen. Evidencia `cpp/engine/interaction/pick_system.cpp:111`.
  - Cursor: `SelectionHandler.updateRotationCursor` calcula angulo via `getRotationCursorAngle`. Evidencia `SelectionHandler.tsx:389`.
  - Interacao: `SelectionHandler` usa `client-rotate` para single selection; fallback `TransformMode.Rotate` se multi. Evidencia `SelectionHandler.tsx:290`.
  - Modifiers: Shift snap 15 deg (engine e client). Evidencia `SelectionHandler.tsx:619` e `cpp/engine/interaction/interaction_session.cpp:930`.
  - Rotacao/Zoom: offset e raio dependem de viewScale no pick; cursor usa centerScreen. Evidencia `pick_system.cpp:118`.

- Move region (Body)
  - Draw: bbox/outline (selection overlay) e shape outlines (engine). Evidencia `ShapeOverlay.tsx:197`.
  - Hit-test: `PickSubTarget::Body` (pick_system) e `SelectionHandler` trata como Move. Evidencia `SelectionHandler.tsx:683`.
  - Cursor: default (cursor do canvas).
  - Interacao: `TransformMode.Move` com axis lock e snap no engine. Evidencia `interaction_session.cpp:491`.
  - Modifiers: Shift = axis lock, Alt = duplicate, Ctrl/Meta = suppress snap. Evidencia `interaction_session.cpp:491` + `interaction_session.cpp:21`.

- Marquee (box select)
  - Draw: `MarqueeOverlay` com LTR/RTL. Evidencia `frontend/features/editor/components/MarqueeOverlay.tsx:27`.
  - Hit-test: area vazia (no pick) em `SelectionHandler.onPointerDown`, estado `marquee`. Evidencia `SelectionHandler.tsx:376`.
  - Cursor: default.
  - Interacao: `marqueeSelect` com `MarqueeMode.Window/Crossing` + `SelectionMode` conforme shift/ctrl. Evidencia `SelectionHandler.tsx:763`.
  - Modifiers: Shift = Add, Ctrl/Meta = Toggle. Evidencia `SelectionHandler.tsx:765`.
  - Rotacao/Zoom: conversion world<->screen no MarqueeOverlay. Evidencia `MarqueeOverlay.tsx:32`.

- Line/Arrow endpoints (Vertex handles)
  - Draw: engine overlay retorna endpoints (Line/Arrow) e ShapeOverlay desenha handles. Evidencia `engine_overlay.cpp:103` + `ShapeOverlay.tsx:241`.
  - Hit-test: `PickSubTarget::Vertex` (line/arrow) com tolerancia. Evidencia `pick_system.cpp:636`.
  - Cursor: default (SelectionHandler nao trata Vertex para cursor).
  - Interacao: `TransformMode.VertexDrag` para endpoints. Evidencia `SelectionHandler.tsx:323`.
  - Modifiers: Shift = snap a 45 deg para line/arrow vertex drag. Evidencia `interaction_session.cpp:664`.

- Polyline vertices/edges
  - Draw: handles em cada vertex via `getSelectionHandleMeta` (Polyline). Evidencia `engine_overlay.cpp:125`.
  - Hit-test: Vertex = `PickSubTarget::Vertex`, Edge = `PickSubTarget::Edge` com tolerancia/segment. Evidencia `pick_system.cpp:658`.
  - Cursor: default.
  - Interacao: Vertex -> `TransformMode.VertexDrag`; Edge -> `TransformMode.EdgeDrag` (porem engine trata como Move). Evidencia `SelectionHandler.tsx:323` e `interaction_session.cpp:491`.
  - Modifiers: Shift em VertexDrag snap a 45 deg (apenas endpoints). Evidencia `interaction_session.cpp:637`.

- Text handles
  - Draw: overlay desenha handles genericos (AABB corners) para text (via getSelectionHandleMeta). Evidencia `engine_overlay.cpp:139`.
  - Hit-test: `pick_system` so tem RotateHandle para text, alem de TextBody/TextCaret. Evidencia `pick_system.cpp:734`.
  - Cursor: default (SelectionHandler nao trata TextBody/TextCaret). Evidencia `SelectionHandler.tsx:679`.
  - Interacao: click/drag = Move (default); double click ativa text tool. Evidencia `SelectionHandler.tsx:815`.
  - Modifiers: n/a.
  - Observacao: resize handles para text nao correspondem a operacoes suportadas.

4. Contracts & Invariants
- Screen vs World
  - Garantido: `screenToWorld` e `worldToScreen` usam mesmo eixo Y invertido. Evidencia `frontend/utils/viewportMath.ts:1` e `cpp/engine/interaction/interaction_session.cpp:29`.
  - Risco: overlay rota pontos no frontend usando rotacao da entidade, mas as coords base sao AABB ja em world (rotacao duplicada/errada). Evidencia `ShapeOverlay.tsx:88` + `engine_overlay.cpp:139` + `pick_system.cpp:318`.

- Pivo/origem
  - Garantido: pivot de rotacao do engine = centro dos bounds da selecao. Evidencia `interaction_session.cpp:405`.
  - Inconsistencia: client-rotate usa center do entity (single) e nao usa session do engine. Evidencia `SelectionHandler.tsx:297`.

- viewScale/zoom
  - Garantido: viewScale sincronizado via `CommandOp.SetViewScale` no layer. Evidencia `EngineInteractionLayer.tsx:86`.
  - Uso correto: tolerancia de pick = 10px/scale no JS. Evidencia `SelectionHandler.tsx:216`.
  - Risco: offset/raio do rotate handle usa viewScale interno do engine; se sync atrasar, cursor/hover divergem (assuncao; confirmar com logging de viewScale no engine).

- Selecao -> bbox/handles consistentes
  - Violado para shapes rotacionadas: handles e outline em `ShapeOverlay` nao correspondem a corners reais (AABB conservador + rotacao). Evidencia `ShapeOverlay.tsx:88` + `pick_system.cpp:318`.

- Cursor reflete handler sob hover
  - Risco: mapeamento de indice de handle vs angulo nao bate com ordem do engine (0=BL...). Evidencia `cursor-config.ts:121` + `engine_overlay.cpp:142`.

- Pointer capture e estabilidade
  - Parcial: capture no layer e `SelectionHandler` evita hover durante drag. Evidencia `EngineInteractionLayer.tsx:103` + `SelectionHandler.tsx:483`.
  - Risco: nao ha controle de pointerId no handler (assuncao: multi-pointer pode gerar eventos mistos; confirmar com multi-pointer manual).

- Commit/cancel e undo
  - OK no engine: `commitTransform` descarta se nao drag. Evidencia `interaction_session.cpp:1056`.
  - Violado para `client-rotate` e `side-resize`: setEntity* gera historico por frame e CommitDraft nao agrupa. Evidencia `SelectionHandler.tsx:721` + `engine_query.cpp:569`.

- Determinismo
  - Engine tem testes de determinismo (snapshot). Evidencia `cpp/tests/determinism_test.cpp:1`.
  - Risco: caminhos client-side (`setEntityRotation`, `setEntitySize`) podem gerar historico com granularidade variavel (assuncao; confirmar com teste de undo/redo durante drag JS).

5. Findings (Deep Dive)
- ID: HND-001
  - Severidade: High
  - Area: Overlay | Hit-test
  - Descricao: Handles e outline de selecao para shapes rotacionadas sao calculados a partir de AABB e depois rotacionados no JS, gerando posicoes que nao correspondem aos corners reais nem ao pick do engine.
  - Evidencia:
    - `cpp/engine/interaction/pick_system.cpp:318` (AABB conservador para rect rotacionado)
    - `cpp/engine/impl/engine_overlay.cpp:139` (handles baseados em AABB)
    - `frontend/features/editor/components/ShapeOverlay.tsx:88` (applyRotation em pontos do overlay)
  - Impacto: handles fora da geometria, hover/pick incorreto, UX inconsistente.
  - Causa raiz provavel: overlay no frontend tentando corrigir rotacao sem dados orientados do engine.
  - Recomendacao: mover geracao de handles/outline orientados para o engine (OBB/handles reais) e renderizar direto sem rotacao extra; remover rotacao manual no JS.
  - Esforco: M
  - Risco de mudanca: Medio

- ID: SEL-002
  - Severidade: High
  - Area: Selection | State Machine
  - Descricao: Multi-select resize usa handles do bbox do grupo mas `pickEx` retorna `selection.front()`; `beginTransform` em Resize opera apenas no `specificId`.
  - Evidencia:
    - `cpp/engine.cpp:469` (retorna `selection.front()` para ResizeHandle)
    - `cpp/engine/interaction/interaction_session.cpp:226` (Resize usa specificId)
    - `frontend/features/editor/components/ShapeOverlay.tsx:147` (handles do bbox do grupo)
  - Impacto: resize de grupo afeta apenas um item; UX enganosa.
  - Causa raiz provavel: faltam transformacoes de grupo para Resize.
  - Recomendacao: implementar resize de grupo no engine (session usa selection e aplica escala/offset) ou ocultar handles de grupo ate suportar.
  - Esforco: M
  - Risco de mudanca: Medio

- ID: HND-003
  - Severidade: High
  - Area: Handlers | Engine-First
  - Descricao: Side-resize e client-rotate calculam geometria no JS e chamam `setEntity*` por frame, quebrando regra engine-first e gerando historico fragmentado.
  - Evidencia:
    - `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:508` (calculo e setEntitySize/Position/Scale)
    - `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:601` (client-rotate setEntityRotation)
    - `cpp/engine/impl/engine_query.cpp:569` (setEntityRotation abre/fecha history a cada chamada)
  - Impacto: undo/redo explode em N steps por drag, performance e determinismo degradam, viola arquitetura.
  - Causa raiz provavel: interacao de side/rotate nao migrada para InteractionSession do engine.
  - Recomendacao: mover side-resize e single-rotate para TransformMode/InteractionSession no engine; expor handles/ops via WASM.
  - Esforco: M
  - Risco de mudanca: Alto

- ID: CUR-004
  - Severidade: Medium
  - Area: Cursors
  - Descricao: Mapeamento de indices 0-3 para angulos assume ordem NE/NW/SW/SE, mas o engine define 0=BL,1=BR,2=TR,3=TL.
  - Evidencia:
    - `frontend/features/editor/config/cursor-config.ts:121`
    - `cpp/engine/impl/engine_overlay.cpp:142`
  - Impacto: cursor de resize indica direcao errada, especialmente em rotacao.
  - Causa raiz provavel: divergencia de contrato de indices entre engine e frontend.
  - Recomendacao: alinhar indices no contrato (documentar e ajustar mapeamento ou engine).
  - Esforco: S
  - Risco de mudanca: Baixo

- ID: HND-005
  - Severidade: Medium
  - Area: Overlay | UX
  - Descricao: Rotate handle e invisivel; existe no pick, mas nao e desenhado no overlay.
  - Evidencia:
    - `cpp/engine/interaction/pick_system.cpp:111` (rotate handle)
    - ausencia em `frontend/features/editor/components/ShapeOverlay.tsx` (apenas bbox/handles)
  - Impacto: usuario nao sabe onde rotacionar; hover por tentativa.
  - Causa raiz provavel: overlay nao implementou rotate handle.
  - Recomendacao: adicionar desenho do rotate handle (posicao do engine) ou mover para engine overlay.
  - Esforco: S
  - Risco de mudanca: Baixo

- ID: HIT-006
  - Severidade: Medium
  - Area: Hit-test
  - Descricao: Prioridade em pick favorece ResizeHandle sobre RotateHandle; pode inviabilizar rotacao em areas proximas.
  - Evidencia: `cpp/engine/interaction/pick_system.h:66` (Resize=10, Rotate=9).
  - Impacto: rotacao dificil de acionar em cantos (especialmente com tolerancias maiores).
  - Causa raiz provavel: prioridade invertida em relacao ao comportamento esperado.
  - Recomendacao: ajustar prioridade ou separar zonas (offset maior, raio menor) para evitar overlap.
  - Esforco: S
  - Risco de mudanca: Baixo

- ID: STM-007
  - Severidade: Medium
  - Area: State Machine | Handlers
  - Descricao: `EdgeDrag` e usado para polylines mas engine trata EdgeDrag como Move (desloca todo o shape).
  - Evidencia:
    - `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:326` (edge drag para polyline)
    - `cpp/engine/interaction/interaction_session.cpp:491` (EdgeDrag = Move)
  - Impacto: drag de segmento nao funciona; comportamento surpresa.
  - Causa raiz provavel: EdgeDrag nao implementado no engine.
  - Recomendacao: implementar EdgeDrag para polyline (segment move) ou remover modo e usar Move com cursor apropriado.
  - Esforco: M
  - Risco de mudanca: Medio

- ID: SEL-008
  - Severidade: Medium
  - Area: Selection
  - Descricao: Ctrl/Meta toggle por click esta comentado mas nao implementado; engine ja tem `selectByPick` com modifier.
  - Evidencia:
    - `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:276`
    - `cpp/engine/entity/selection_manager.cpp:81`
  - Impacto: comportamento de selecao inconsistente (Ctrl click nao alterna).
  - Causa raiz provavel: duplicacao de logica de selecao no JS.
  - Recomendacao: usar `runtime.selectByPick(pick, modifiers)` ou implementar toggle no handler.
  - Esforco: S
  - Risco de mudanca: Baixo

- ID: GEO-009
  - Severidade: Medium
  - Area: Transform | Rotation
  - Descricao: Rotacao usa delta normalizado em [-180,180], causando salto ao cruzar limite (engine e client).
  - Evidencia:
    - `cpp/engine/interaction/interaction_session.cpp:925`
    - `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:608`
  - Impacto: rotacao nao continua ao passar de 180 graus; jitter.
  - Causa raiz provavel: delta calculado sempre a partir do angulo inicial sem acumulacao.
  - Recomendacao: acumular delta incremental com unwrap continuo.
  - Esforco: M
  - Risco de mudanca: Medio

- ID: TXT-010
  - Severidade: Medium
  - Area: Handlers | Overlay
  - Descricao: Text mostra handles de resize (AABB corners) mas o pick do engine so expõe rotate handle e text body; resize nao e suportado.
  - Evidencia:
    - `cpp/engine/interaction/pick_system.cpp:734` (text rotate handle)
    - `cpp/engine/impl/engine_overlay.cpp:139` (handles genericos via AABB)
  - Impacto: UI sugere resize de texto mas nao funciona.
  - Causa raiz provavel: overlay generico sem filtro por tipo.
  - Recomendacao: ocultar handles de resize para text ou implementar resize no engine.
  - Esforco: S
  - Risco de mudanca: Baixo

- ID: PERF-011
  - Severidade: Medium
  - Area: Performance | Hot Path
  - Descricao: `getSelectionIds` aloca `Uint32Array` novo em cada chamada e o handler força re-render por pointermove.
  - Evidencia:
    - `frontend/engine/core/runtime/SelectionSystem.ts:12`
    - `frontend/features/editor/interactions/useInteractionManager.ts:37` (forceUpdate)
    - `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:507` (notifyChange em move)
  - Impacto: GC e re-render em hot path; potencial >16ms em grandes docs.
  - Causa raiz provavel: API de selecao nao fornece view sem alocacao; overlay/cursor em React.
  - Recomendacao: expor selecao como view/ptr ou cache; mover cursor/overlay para layer mais direto (Canvas/WebGL) ou reduzir re-render.
  - Esforco: M
  - Risco de mudanca: Medio

- ID: CUR-012
  - Severidade: Low
  - Area: Cursors
  - Descricao: Calibracao do cursor de rotacao usa offset magico (40) e correcoes +90 ad hoc para side handles.
  - Evidencia: `frontend/features/editor/config/cursor-config.ts:74` e `SelectionHandler.tsx:694`.
  - Impacto: manutencao dificil e risco de regressao ao trocar asset.
  - Causa raiz provavel: falta de fonte unica e testes de cursor.
  - Recomendacao: consolidar offsets com testes de calibracao e documentar contrato.
  - Esforco: S
  - Risco de mudanca: Baixo

6. Debt & Maintainability Scorecard
- Duplicacao: Alta (logica de handles e rotacao em JS e C++; selection toggle no JS vs engine). Evidencia `SelectionHandler.tsx` + `selection_manager.cpp`.
- Acoplamento: Medio-Alto (ShapeOverlay assume rotacao local e dados de AABB; pick assume outra). Evidencia `ShapeOverlay.tsx:75` + `engine_overlay.cpp:139`.
- Magic numbers: Alto (tolerancia 10px, offset 15px, radius 10px, drag thresholds 2/3/5px, cursor offset 40). Evidencia `SelectionHandler.tsx:216`, `pick_system.cpp:115`, `interactionHelpers.ts:30`, `interaction_session.cpp:220`, `cursor-config.ts:74`.
- Estados implicitos: Medio (SelectionHandler usa `state` + pointerDown; sem pointerId). Evidencia `SelectionHandler.tsx:94`.
- Determinismo: Medio (engine cobre; JS side-resize/rotate quebra transacao). Evidencia `determinism_test.cpp:1` + `SelectionHandler.tsx:508`.
- Shape-specific hacks: Medio (EdgeDrag para polyline sem engine; handles para text). Evidencia `SelectionHandler.tsx:326` + `pick_system.cpp:734`.

7. Plano de Acao (Roadmap)
- Fase 0: guardrails
  - Tasks: documentar contrato de indices de handles e prioridades; centralizar constantes (tolerancias, offsets) em um modulo unico; asserts/diagnosticos quando overlay e pick divergem.
  - Aceite: doc + tests de contrato; logs detectam mismatch de handle.
- Fase 1: separar model/hit-test/render/state machine
  - Tasks: mover side-resize e client-rotate para `InteractionSession`; remover `setEntity*` do JS; manter JS so como dispatcher.
  - Aceite: nenhuma modificacao geometrica em JS durante drag; `SelectionHandler` apenas envia comandos.
- Fase 2: unificar geometria de bbox/handles + rotacao/zoom
  - Tasks: engine gerar handles orientados (OBB) e overlay completo (incluindo rotate handle); frontend apenas renderiza sem rotacao extra.
  - Aceite: handles/outline iguais ao hit-test em rotacao (teste automatizado).
- Fase 3: suite minima de testes de regressao
  - Tasks: testes unitarios de mapeamento de cursor; testes de resize/rotate para 0/90/180/270; multi-select resize/rotate; text handles visibilidade.
  - Aceite: novos testes falham no estado atual e passam apos fix.
- Fase 4: performance/profiling + cache/invalidation
  - Tasks: reduzir alocacoes em `getSelectionIds`; reduzir re-render por pointermove (cursor/overlay fora de React ou batched updates); medir com perf markers.
  - Aceite: pointermove <16ms em 10k entidades com selecao.
- Fase 5: evolucao (multi-select avancado, snapping robusto, plugins)
  - Tasks: group resize/rotate com pivot configuravel; snapping por entidades e guias; extensao de handlers por plugin.
  - Aceite: novos handlers plugaveis sem tocar SelectionHandler.

8. Appendix
- Comandos rodados
  - `rg -n "SelectionHandler|ShapeOverlay|handler|handle|anchor|resize|rotate|cursor|hitTest|hover|pointerCapture|threshold|snap|viewScale" cpp frontend docs -g"*.{h,hpp,cpp,cc,cxx,ts,tsx}"`
  - `rg -n "SelectionHandler|ShapeOverlay" cpp frontend docs`
  - `rg --files frontend/features/editor/interactions -g"*.{ts,tsx}"`
  - `rg -n "SelectionHandle|Overlay|Handle|RotationHandle|Pick" cpp/engine cpp/tests -g"*.{h,hpp,cpp,cc}"`
  - `sed -n ...` e `nl -ba ...` nos arquivos citados
- Outputs importantes (curtos)
  - Nenhum teste executado; sem logs de runtime.
- Lista completa de arquivos auditados
  - `frontend/features/editor/interactions/handlers/SelectionHandler.tsx`
  - `frontend/features/editor/components/ShapeOverlay.tsx`
  - `frontend/features/editor/components/EngineInteractionLayer.tsx`
  - `frontend/features/editor/interactions/useInteractionManager.ts`
  - `frontend/features/editor/interactions/BaseInteractionHandler.ts`
  - `frontend/features/editor/interactions/sideHandles.ts`
  - `frontend/features/editor/interactions/handlers/sideResizeGeometry.ts`
  - `frontend/features/editor/components/MarqueeOverlay.tsx`
  - `frontend/features/editor/components/RotationCursor.tsx`
  - `frontend/features/editor/components/ResizeCursor.tsx`
  - `frontend/features/editor/config/cursor-config.ts`
  - `frontend/features/editor/utils/interactionHelpers.ts`
  - `frontend/engine/core/runtime/SelectionSystem.ts`
  - `frontend/engine/core/runtime/PickSystem.ts`
  - `frontend/engine/core/runtime/TransformSystem.ts`
  - `frontend/engine/core/interactionSession.ts`
  - `frontend/engine/core/overlayDecoder.ts`
  - `cpp/engine/interaction/pick_system.h`
  - `cpp/engine/interaction/pick_system.cpp`
  - `cpp/engine/interaction/interaction_session.h`
  - `cpp/engine/interaction/interaction_session.cpp`
  - `cpp/engine/impl/engine_overlay.cpp`
  - `cpp/engine/impl/engine_query.cpp`
  - `cpp/engine.cpp`
  - `cpp/engine/entity/selection_manager.cpp`
  - `cpp/tests/engine_test.cpp`
  - `cpp/tests/overlay_query_test.cpp`
  - `cpp/tests/determinism_test.cpp`
  - `frontend/tests/interactions/SelectionHandler.test.ts`
  - `frontend/tests/components/ShapeOverlay.test.tsx`
  - `frontend/features/editor/interactions/handlers/sideResizeGeometry.test.ts`
