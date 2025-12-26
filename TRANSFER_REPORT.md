# CHECKUP FINAL — ENGINE-FIRST VALIDATION

## 1. Executive Summary

- Veredito técnico: ainda NÃO pronto como “gate final” por ausência de Resize/handles end-to-end, mas o pipeline crítico
  de sessão (commit/cancel) e o contrato ABI MOVE/VERTEX_SET estão coerentes e cobertos por testes.
- RESOLVIDO (persistência): commitTransform() aplica diffs no Source of Truth (Zustand) e grava histórico/undo
  (frontend/features/editor/components/EngineInteractionLayer.tsx, frontend/engine/core/interactionSession.ts).
- RESOLVIDO (ABI/semântica): VERTEX_SET decodifica payload [idx, x, y, _] alinhado ao Engine, com testes
  (frontend/engine/core/interactionSession.ts, frontend/tests/interactionSessionCommit.test.ts).
- AINDA PENDENTE (resize/handles): não existe pipeline real para Resize via handles (pick/transform); PICK_HANDLES está
  ausente/inefetivo no Engine (cpp/engine/pick_system.cpp) e não há TransformMode.Resize end-to-end.
- Seleção por clique/hover: consolidada em pickEx no EngineInteractionLayer (sem hit-test JS no caminho de clique);
  useSelectInteraction ficou marquee-only (frontend/features/editor/hooks/useSelectInteraction.ts).
- Sessões: cancelamento robusto (ESC/pointercancel/lostpointercapture/blur/visibilitychange) chama cancelTransform() e
  reduz risco de sessão “presa” travando o sync.
- Testes: suíte pnpm test no frontend/ passou (Vitest: 31 files, 130 testes).

## 2. O que está CORRETO agora

- Picking C++ como fonte primária: EngineInteractionLayer usa runtime.pickEx(...) no PointerDown do tool select e
  decide subTarget (Vertex/Edge/Body) antes de qualquer lógica legada (frontend/features/editor/components/
  EngineInteractionLayer.tsx:269).
- Render pipeline é de fato WASM→WebGL2: TessellatedWasmLayer/CanvasController renderizam buffers vindos do WASM por
  RAF, então transforms no engine aparecem “ao vivo” (frontend/engine/core/CanvasController.ts:62, frontend/engine/
  renderer/TessellatedWasmLayer.tsx:32).
- Sessões de interação no Engine existem e são consistentes internamente: beginTransform/updateTransform/
  commitTransform/cancelTransform/isInteractionActive estão implementadas e expostas (cpp/engine/engine.h:521, cpp/
  engine/bindings.cpp:105).
- Sync React→Engine com dirty flags + guard de interação: useEngineStoreSync bloqueia sync quando
  isInteractionActive() está true, evitando “briga” Store vs sessão local (frontend/engine/core/
  useEngineStoreSync.ts:410).
- Marquee broad-phase no Engine: useSelectInteraction usa engine.queryArea(...) quando disponível, reduzindo
  dependência de varredura total (frontend/features/editor/hooks/useSelectInteraction.ts:138).

## 3. O que foi corrigido em relação aos problemas anteriores

- Consolidação do caminho de clique para seleção: o clique do select passa por pickEx e não por geometria JS ad-hoc
  (isso endereça a classe de bugs “hit-test divergente”).
- Prevenção explícita de conflito sync vs drag: guard de isInteractionActive() no sync (frontend/engine/core/
  useEngineStoreSync.ts:410) é uma correção direta do problema típico “Store atualiza durante drag e sobrescreve o
  Engine”.
- Remoção parcial de O(N) em seleção por área: queryArea no engine substitui o antigo fallback de “varrer shapes” na
  maioria dos builds (frontend/features/editor/hooks/useSelectInteraction.ts:138).

## 4. Pontos de Atenção (Remaining Risks)

- Contrato de commit parcial: applyCommitOpToShape cobre MOVE e VERTEX_SET; qualquer novo TransformOpCode emitido pelo
  Engine precisa de mapeamento explícito no TS (senão o commit vira noop + warning DEV).
- Resize/handles inexistente no pipeline real (CRÍTICO):
  - Engine: PICK_HANDLES declarado como “not fully implemented” e não há emissão de PickSubTarget::ResizeHandle
    (cpp/engine/pick_system.cpp:10).
  - Frontend: não existe branch para PickSubTarget.ResizeHandle nem uso de TransformMode.Resize; SelectionOverlay
    desenha handles com pointerEvents: none, portanto são apenas visuais (frontend/features/editor/components/
    SelectionOverlay.tsx:200).
- Risco residual de sessão “presa”: o hardening cobre ESC/pointercancel/lostpointercapture/blur/visibilitychange e
  cancel defensivo, mas bugs no C++/WASM ainda podem manter isInteractionActive() true e congelar o sync.
- Semântica de “locked” inconsistente: buildVisibleOrder inclui shapes em layers locked (filtra só visible) (frontend/
  engine/core/useEngineStoreSync.ts:379), e o caminho engine-first de drag não bloqueia locked; isso permite mover/
  selecionar shapes em layer locked via pickEx + beginTransform.
- Marquee ainda depende de geometria JS para “window vs crossing”: broad-phase no engine, mas decisão final usa
  isShapeInSelection(...) em JS (frontend/features/editor/hooks/useSelectInteraction.ts:159), potencialmente
  divergente do Engine (especialmente para polygon regular e text com rotação, onde o engine é aproximado em alguns
  pontos).
- Overlays React pesados: StrokeOverlay faz for (Object.keys(shapesById)) (O(N)) e recalcula em qualquer update de
  shapes; se algum modo ainda atualiza Store durante pointermove (ex.: tool move), isso vira hot-path caro (frontend/
  features/editor/components/StrokeOverlay.tsx:39).
- Resíduos de domínio/disciplinas: frontend/utils/visibility.ts:4 ainda carrega lógica electrical/referências, o que é
  inconsistência arquitetural (mesmo que hoje o UI limite a architecture).

## 5. Violações de Engine-First (se existirem)

- Source of Truth ainda não é o Engine: o fluxo canônico continua sendo Store→Engine via useEngineStoreSync (React-
  first por definição) (frontend/engine/core/useEngineStoreSync.ts:393).
- Sem shadow state persistente (MOVE/VERTEX_SET): commitTransform escreve no Store e registra histórico; o Engine volta a
  refletir o Store após commit/cancel.
- Seleção/locks não são autoridade do Engine: lock/visibilidade/interatividade são aplicados no frontend (ex.:
  marquee) e não via flags no engine (inclusive SetEntityFlags nem existe no C++ e é evitado) (frontend/engine/core/
  useEngineStoreSync.ts:416).
- Handles/Resize não são engine-first: não há picking/transform de handles no engine (cpp/engine/pick_system.cpp:10) e
  não há pipeline correspondente no TS.

## 6. Checklist de Prontidão

- [x] Click-select/hover no modo select é via pickEx (sem hit-test JS no caminho do clique).
- [ ] Marquee selection não depende de filtro geométrico crítico em JS (ainda usa isShapeInSelection no frontend).
- [x] Move com botão esquerdo funciona e persiste no Store (MOVE commit→updateShape).
- [ ] Resize via handles altera shape real (pipeline ausente).
- [x] Vertex drag persiste correto no Store (VERTEX_SET ABI alinhada e testada).
- [ ] pickEx cobre subTargets necessários para UX (handles não implementados no engine).
- [x] ESC cancela interação ativa (cancelTransform wired).
- [x] Sync não interfere durante interação (guard por isInteractionActive) (frontend/engine/core/
      useEngineStoreSync.ts:410).
- [x] Engine é autoridade durante a sessão; Store volta a ser autoridade após commit/cancel (React-first controlado).
- [ ] Sem risco de ABI drift TS↔WASM no pipeline de interação (MOVE/VERTEX_SET locked; demais opCodes pendentes +
      warning de duplicidade em commandBuffer.ts).
- [x] Test suite passa (frontend: Vitest 130/130).

## 7. Veredito Final

Ainda NÃO aprovado como “gate final”. Os blockers P0 do pipeline de commit/cancel (MOVE/VERTEX_SET) e a consolidação de
click-select/hover via pickEx foram resolvidos (Fases 0–2), mas Resize/handles segue ausente end-to-end e ainda há
riscos de coerência (marquee com filtro geométrico em JS, semântica de locked/discipline fora do Engine).

## 8. FASES

FASE 0 — P0: Commit→Store + Contrato ABI (MOVE / VERTEX_SET) (EXECUTADA)
Objetivo:
Tornar o fim de uma sessão (commitTransform) determinístico e React-first, aplicando o resultado no Zustand (com
histórico correto) e travando o contrato de payload TS↔C++.
Problemas atacados:

- [P0] commitTransform() não aplica mudanças no Store (shadow state).
- [P0] Drift de ABI no payload VERTEX_SET (schema/decodificação divergente).
- [P0] Drift potencial por enums/constantes duplicadas (valores “hardcoded” no TS).
  Escopo:
- Implementar uma tradução única CommitResult → diffs Zustand → saveToHistory para MOVE e VERTEX_SET.
- Corrigir e documentar o schema do payload VERTEX_SET (ex.: payload[0]=vertexIndex, payload[1]=x, payload[2]=y).
- Garantir prev/undo correto (snapshot pré-commit) e que o Store seja a autoridade após commit.
- Adicionar testes unitários de contrato (decodificação + aplicação no store) e smoke test de undo/redo.
  Fora de escopo:
- Cancelamento robusto (ESC/pointercancel/blur) e watchdog.
- Resize/handles e novos subTargets.
- Refatorar useSelectInteraction ou migrar Source of Truth para o Engine.
  Critérios de aceite:
- Move: ao soltar o mouse, o shape permanece no novo lugar e o inspector/props refletem o novo estado (Store
  atualizado).
- Vertex drag: o vértice correto termina na posição correta (sem troca de idx/coords) e persiste no Store.
- Undo/redo reverte/reaplica commits de move/vertex de forma observável.
- Recarregar a página ou reinicializar o engine não “desfaz” o que foi commitado (porque está no Store).
  Riscos se pulada:
- Shadow state continua (Engine ≠ Store), inviabilizando validação confiável e gerando regressões silenciosas.
- Hardening de sessão vira paliativo e pode mascarar corrupção de estado no commit.

Status:
EXECUTADA.
Implementação (principais evidências):
- frontend/engine/core/interactionSession.ts (contrato TransformOpCode + decodificação/aplicação MOVE/VERTEX_SET).
- frontend/features/editor/components/EngineInteractionLayer.tsx (commitTransform → updateShape(recordHistory:false) + saveToHistory com prev correto).
- frontend/tests/interactionSessionCommit.test.ts (testes do contrato MOVE/VERTEX_SET).

———

FASE 1 — P0: Hardening de Sessão (ESC / pointercancel / anti-deadlock) (EXECUTADA)
Objetivo:
Garantir que toda sessão do Engine tenha encerramento robusto (commit ou cancel) e que isInteractionActive() nunca
congele o sync.
Problemas atacados:

- [P0] Falta de cancelamento robusto (ESC).
- [P0] Falta de tratamento de pointercancel/lostpointercapture/blur.
- [P0] Risco de sessão “presa” travando useEngineStoreSync.
  Escopo:
- Wiring de ESC durante sessão: chamar cancelTransform(), limpar estado local de drag e restaurar UX.
- Tratar pointercancel, lostpointercapture, window.blur/visibilitychange como cancelamento seguro.
- Adicionar detecção “stuck session” mínima (telemetria/timeout DEV-first) para forçar cancel quando não há input
  ativo.
- Manter React-first: cancel não escreve no Store; o Engine volta ao estado derivado do Store.
  Fora de escopo:
- Alterar regras de picking/seleção (exceto garantir que sessão não inicia sem runtime pronto).
- Resize/handles.
- Refatoração estrutural do pipeline de interação.
  Critérios de aceite:
- ESC durante move/vertex/resize (quando existir) cancela e retorna ao estado anterior sem travar o sync.
- Perda de foco durante drag não deixa sessão ativa; ao voltar, o editor continua sincronizando.
- Não existe cenário observável onde isInteractionActive() fique true após o término/cancelamento.
  Riscos se pulada:
- O guard do sync vira ponto único de falha: um pointercancel pode “matar” o editor até reload.
- Com a FASE 0 aplicada, aumenta risco de commits/cancels incompletos e estados inconsistentes.

Status:
EXECUTADA.
Implementação (principais evidências):
- frontend/features/editor/components/EngineInteractionLayer.tsx (ESC + pointercancel/lostpointercapture/blur/visibilitychange → cancelTransform + limpeza de estado local; cancel defensivo de sessão “presa”).

———

FASE 2 — P1: Consolidar Click-Select/Drag Start em pickEx (reduzir useSelectInteraction) (EXECUTADA)
Objetivo:
Eliminar “shadow paths” JS de seleção por clique e tornar pickEx a única autoridade para hit-test de clique/hover no
modo select.
Problemas atacados:

- [P1] Lógica duplicada JS vs Engine (especialmente useSelectInteraction) interferindo em seleção/start de drag.
- [P1] Fallbacks de picking/hover que criam divergência (seleção por um caminho, drag por outro).
  Escopo:
- Restringir useSelectInteraction a marquee-only (estado da caixa + aplicação final).
- Centralizar no EngineInteractionLayer o click-select/hover cursor e a decisão de iniciar sessão via PickSubTarget.
- Instrumentação DEV (logs/contadores) para provar que click-select não passa por geometria JS.
- Manter React-first: seleção permanece no UI store; Engine responde queries e executa sessões.
  Fora de escopo:
- Marquee selection 100% engine-side (interseção window/crossing no C++).
- Resize/handles.
- Mudança do modelo de seleção (multi-select avançado/modifiers além do atual).
  Critérios de aceite:
- Clique simples seleciona consistentemente via pickEx (observável por telemetria/log DEV).
- Não há fluxo “overlay move mas shape não” (depende da FASE 0) nem divergência de seleção ao iniciar drag.
- useSelectInteraction não faz picking por clique/hover; apenas marquee.
  Riscos se pulada:
- Regressões continuam bifurcando por “qual caminho rodou” (Engine vs JS), dificultando debug e QA.
- Cada evolução do Engine aumenta chance de conflito com lógica legada no frontend.

Status:
EXECUTADA.
Implementação (principais evidências):
- frontend/features/editor/hooks/useSelectInteraction.ts (marquee-only; sem click-select/hover hit-test).
- frontend/features/editor/components/EngineInteractionLayer.tsx (click-select/drag start e hover cursor via pickEx; click vazio limpa seleção; pointercancel/lostpointercapture limpam marquee).
- Instrumentação DEV: localStorage DEV_TRACE_PICK=1 loga inputs/resultados do pickEx.

———

FASE 3 — P1: Guardrails de UX (desativar Resize/Handles até existir suporte no Engine)
Objetivo:
Remover affordances quebradas de resize para evitar que o usuário entre em fluxos inexistentes/inconsistentes.
Problemas atacados:

- [P1] Resize/handles não implementados no Engine, mas UI pode sugerir que existe.
  Escopo:
- Ocultar/desativar handles de resize na UI (ou behind feature flag default-off).
- Remover cursor/hints de resize e bloquear qualquer início de TransformMode.Resize no frontend.
- Documentar explicitamente que resize está desabilitado até a FASE 4.
  Fora de escopo:
- Implementar handles no C++.
- Implementar TransformMode.Resize/TransformOpCode.RESIZE.
  Critérios de aceite:
- Não existem handles de resize visíveis/clicáveis no modo select.
- Usuário não consegue iniciar um “quase resize” (estado intermediário sem commit/cancel).
  Riscos se pulada:
- UX “mentirosa” gera bugs percebidos como seleção/move instáveis (na prática, tentativa de resize).
- Aumenta ruído no QA e dificulta separar regressões reais do pipeline.

———

FASE 4 — P2: Handles + Resize Engine-First (end-to-end, feature flag)
Objetivo:
Entregar resize real via handles com pickEx + sessão no Engine + commit para o Store, de forma incremental e
controlada.
Problemas atacados:

- [P2] PICK_HANDLES/PickSubTarget.ResizeHandle inexistentes/inefetivos no Engine.
- [P2] Pipeline TransformMode.Resize + TransformOpCode.RESIZE ausente TS↔C++.
  Escopo:
- C++: implementar hit-test de handles (bbox) retornando ResizeHandle + subIndex.
- C++: implementar TransformMode::Resize com commit emitindo RESIZE em schema documentado.
- TS: iniciar sessão quando subTarget=ResizeHandle, traduzir commit→diffs no Store + histórico/undo.
- Rollout por feature flag (default-off; habilitar em DEV/QA).
  Fora de escopo:
- RotateHandle/rotação interativa, constraints complexos, multi-select resize, proporções avançadas.
  Critérios de aceite:
- Com flag on: arrastar handle redimensiona durante drag e persiste no Store ao soltar; undo/redo funciona.
- pickEx retorna ResizeHandle ao clicar nos handles (com subIndex consistente).
- Cancelamento (FASE 1) funciona também no resize e não trava sync.
  Riscos se pulada:
- Editor permanece sem um pilar de UX CAD/Figma (resize), limitando validação de “pronto para usuários”.
- Pressão para reintroduzir resize via JS tende a recriar geometria duplicada e regressões.

———

FASE 5 — P2: Marquee Selection Engine-Side (remover geometria crítica JS)
Objetivo:
Mover a decisão final de seleção por área (window/crossing) para o Engine, eliminando duplicação geométrica no
frontend.
Problemas atacados:

- [P2] Lógica duplicada JS vs Engine no marquee (candidatos via AABB no engine + filtro geométrico JS).
- [P2] Risco de O(N) e divergência por tipo de shape.
  Escopo:
- Expor API no Engine para seleção por retângulo com modo (WINDOW/CROSSING) retornando IDs finais.
- Frontend passa a definir selectedShapeIds a partir do resultado do Engine (sem isShapeInSelection).
- Manter React-first: seleção continua no UI store; Engine fornece query determinística.
  Fora de escopo:
- Engine como Source of Truth do documento (Engine-First real).
- Reescrever stores/serialização.
  Critérios de aceite:
- Marquee window/crossing seleciona de forma consistente com o que o usuário vê, sem divergência por shape type.
- Não há varredura total de shapes em fluxos interativos; seleção por área é estável em performance.
- Funciona sob pan/zoom e não reintroduz paths JS paralelos.
  Riscos se pulada:
- Divergência continua exatamente no fluxo mais propenso a edge cases geométricos.
- Custo de manutenção cresce (regras de seleção duplicadas a cada evolução do Engine).
