# PLANO DE FECHAMENTO — Engine-First (pós Fases 0–5)

Este documento lista o que ainda está **incompleto**, **inconsistente** ou **arriscado** após as Fases 0–5, e propõe um plano de execução em PRs pequenos, com critérios de aceite observáveis.

## Estado Atual (baseline)

- Interações Engine-first funcionando (com commit→Store):
  - `MOVE` / `VERTEX_SET` / `RESIZE` (dev-flagged) com `beginTransform → updateTransform → commitTransform → applyCommitOpToShape → updateShape + saveToHistory`.
- Picking:
  - Click/hover no select via `pickEx`.
  - Handles de resize via `PickSubTarget.ResizeHandle` (atrás de `enableEngineResize`).
- Marquee:
  - WINDOW/CROSSING engine-side via `queryMarquee` (fallback para `queryArea` + `isShapeInSelection` somente em WASM antigo).

## Principais Pendências / Erros (priorizados)

### P0 — Bloqueadores práticos de “gate”

1) **Validação WASM/compilação (blind coding risk)**
- Mudanças C++ recentes (resize + queryMarquee) não foram validadas por rebuild do WASM neste ambiente.
- Risco: regressão silenciosa (feature flag habilitada, mas WASM antigo → no-op/UX quebrada).

2) **Guardrail de compatibilidade TS↔WASM (capabilities/ABI)**
- Hoje o frontend assume que o WASM “tem” as features quando o usuário liga flags.
- Risco: feature flags expõem UI/fluxos que o WASM não suporta (especialmente `enableEngineResize` e `queryMarquee`).

3) **Semântica de `locked` aplicada de forma inconsistente**
- Clique/drag engine-first pode selecionar e iniciar sessão em shapes de layer `locked` (marquee já filtra).
- Risco: quebra expectativa básica de CAD (locked = não editável) e gera regressões de seleção/move.

4) **Resíduos de domínio “electrical” (violação direta do escopo genérico)**
- Existem referências explícitas a “electrical” (ex.: `frontend/utils/visibility.ts`, `frontend/features/editor/ribbon/components/ElectricalShortcuts.tsx`, keybindings).
- Risco: comportamento de visibilidade/interatividade incorreto + dívida arquitetural (o produto é CAD genérico).

5) **Aviso/bug TS: `commandBuffer.ts` com `case` duplicado**
- Há `case CommandOp.DeleteText` duplicado no switch de `encodeCommandBuffer`, emitindo warning do esbuild.
- Risco: drift contínuo + ruído de build + risco de “comando errado” em evoluções futuras.

### P1 — Coerência/UX e estabilidade de migração

6) **Overlay de seleção durante sessões do Engine**
- Durante drag Engine-first, o Store não muda até commit; overlays derivados do Store podem ficar “stale”.
- Risco: UX confusa (handles/caixa não acompanham o shape durante o drag), especialmente em resize.

7) **SetEntityFlags existe no TS mas não existe no C++**
- `CommandOp.SetEntityFlags(20)`/`SetEntityFlagsBatch(21)` estão no TS e explicitamente “skipped” no sync.
- Risco: ABI drift e falsa sensação de suporte a flags no Engine.

8) **Políticas de marquee/crossing para circle/polygon são AABB-based**
- Mantém comportamento anterior, mas é uma decisão explícita (pode selecionar mais do que o contorno real).
- Risco: edge cases em QA se o esperado for “interseção real”.

### P2 — Performance e limpeza final

9) **Overlays O(N)**
- Ex.: `StrokeOverlay` itera todas as shapes e pode reagir a updates frequentes (dependendo do tool/path).
- Risco: jank em documentos grandes; piora se algum path ainda atualiza Store em `pointermove`.

## Plano de Execução (PRs pequenos)

### PR-01 (P0) — Rebuild/Validação WASM + sanity checklist
Objetivo: garantir que o binário WASM/JS expõe as APIs novas e que não há regressões óbvias.
Escopo:
- Rodar `pnpm -C frontend build:wasm` e validar no browser:
  - Marquee WINDOW/CROSSING seleciona conforme esperado (line/polyline/arrow segment-intersection; demais por AABB).
  - `enableEngineResize` liga handles e permite resize real (rect/circle/polygon).
  - ESC/pointercancel/lostcapture cancela sem travar `useEngineStoreSync`.
Fora de escopo:
- Otimizações/perf.
Critérios de aceite:
- WASM rebuild ok e a UI consegue exercitar `queryMarquee` + resize end-to-end.
- Sem erros de runtime no console ao habilitar `enableEngineResize`.

### PR-02 (P0) — Capability/ABI Guard (feature flags seguras)
Objetivo: impedir que o frontend exponha fluxos que o WASM não suporta.
Escopo:
- Expor no C++ um “capabilities bitset”/`getAbiVersion()` (mínimo: `HAS_QUERY_MARQUEE`, `HAS_RESIZE_HANDLES`, `HAS_TRANSFORM_RESIZE`).
- No frontend:
  - Detectar capabilities no init do runtime.
  - Forçar `enableEngineResize=false` se capability ausente (ou bloquear toggle com tooltip).
  - Opcional: log DEV claro quando uma feature depende de rebuild do WASM.
Fora de escopo:
- Refatorar arquitetura; apenas guardrails.
Critérios de aceite:
- Com WASM antigo: toggle não ativa fluxo quebrado; marquee cai em fallback; nenhum “resize handle fantasma”.

### PR-03 (P0) — Enforce `locked` em click-select + beginTransform
Objetivo: impedir seleção/transform de shapes em layer `locked` nos caminhos engine-first.
Escopo:
- No pointerdown do select (engine-first):
  - Ao resolver `strId`, checar `layers`/shape.layerId → se `locked`, tratar como “miss” (ou selecionar sem permitir drag).
- Garantir que:
  - `beginTransform` não inicia para locked (Move/Vertex/Resize).
  - Cursor hover não sugere “move/resize” em locked.
Fora de escopo:
- Implementar flags no Engine.
Critérios de aceite:
- Locked nunca move/resize/vertex-drag via select+drag.
- Marquee já filtra locked e continua consistente com click-select.

### PR-04 (P0) — Remover resíduos “electrical” (escopo genérico)
Objetivo: remover referências explícitas ao domínio elétrico e simplificar visibilidade/interação.
Escopo:
- Remover/renomear `ElectricalShortcuts.tsx` (ex.: `TransformShortcuts`).
- Atualizar `frontend/utils/visibility.ts` para não depender de “electrical”/referências cruzadas.
- Atualizar keybindings/config para nomes genéricos (`transform.rotate`, `transform.flipH/V`, etc.).
- Manter compatibilidade de load de projetos antigos (migration já dropa campos elétricos).
Fora de escopo:
- Reescrever schema de projeto; apenas remover resíduos explícitos.
Critérios de aceite:
- `rg "electrical" frontend` não retorna referências de domínio (exceto migração legada/documentação, se mantida por compat).
- Visibilidade/interatividade não muda inesperadamente (baseline: “tudo visível/interagível” por layer/floor, sem disciplina).

### PR-05 (P1) — Overlay coerente durante sessões do Engine
Objetivo: eliminar UX “stale” (overlay não acompanha) durante move/resize engine-first sem voltar a escrever no Store em `pointermove`.
Opções (ordem recomendada):
1) Expor no Engine um query barato de AABB atual por ID (ex.: `getEntityAabb(id)`), e desenhar overlay baseado nisso durante sessão ativa.
2) Como fallback temporário: ocultar handles/outline durante sessão ativa (evita UI “mentirosa”, mas perde feedback).
Critérios de aceite:
- Durante drag: overlay acompanha o shape (ou fica oculto de forma consistente), sem atualizar Store até commit.
- Sem loops O(N) em `pointermove`.

### PR-06 (P1) — Resolver drift em `commandBuffer.ts` (e warning)
Objetivo: eliminar warning e reduzir risco de ABI drift.
Escopo:
- Remover `case CommandOp.DeleteText` duplicado no switch de encode.
- Revisar `CommandOp.SetEntityFlags*`:
  - ou remover do TS (se não for implementar),
  - ou implementar no C++ e passar a emitir no sync (apenas após decisão explícita).
Critérios de aceite:
- Build/test sem warning de “case clause duplicates”.
- Tabela TS↔C++ de `CommandOp` fica consistente/documentada.

### PR-07 (P2) — Perf pass (apenas hot paths)
Objetivo: reduzir risco de jank em documentos grandes sem reescrever arquitetura.
Escopo:
- Identificar overlays O(N) que re-renderizam em loops interativos e colocar guardrails (memo/selectors mais estreitos).
- Garantir que toolpaths que ainda fazem `updateShape(..., recordHistory:false)` em `pointermove` não disparem recomputações globais.
Critérios de aceite:
- `pointermove` em drag não itera todas as shapes.
- `perfBudgets.test.ts` permanece verde.

## O que permanece React-first (explicitamente)

- **Store Zustand** continua sendo autoridade do documento (shapes + z-order + layers).
- Engine continua “executor” de sessão local + renderer; commits sempre voltam para o Store.
- Selection state continua em `useUIStore` (até um checkpoint explícito de migração).

