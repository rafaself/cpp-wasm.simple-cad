# Verificação de Implementação – PR0–PR7 (plano report_23)

Data: 2025-12-21  
Base avaliada: `resources/reports/report_23_action-plan-section-d-optimized.md`  
HEAD: `32645b89256980cdb36f7bce798a0b0d3ff59714`

## Problem (1 frase)
Confirmar se as melhorias do plano PR0–PR7 foram aplicadas no repositório, com evidências e verificação executável.

## Plan
1) Checar presença/alterações esperadas por PR (arquivos e padrões).  
2) Executar verificações locais possíveis (frontend + C++).  
3) Registrar gaps e recomendações objetivas para fechar o plano.  

## Files changed
- `resources/reports/report_24_pr-verification-pr0-pr7.md` (este relatório)

## Risk
Baixo (somente auditoria). Riscos residuais listados em “Gaps”.

## Verification (executado)
- `cd frontend && npm test` ✅ (23 arquivos, 108 testes)
- `cd frontend && npm run build` ✅
- `cd frontend && npm test -- --runInBand` ❌ (falha: opção desconhecida do Vitest)
- `ctest --test-dir cpp/build_native --output-on-failure` ✅ (10 testes)
- Backend: `python` não disponível no ambiente desta checagem → não executei `pytest`.

---

# Status por PR (PR0–PR7)

## PR0 (P0) — Onboarding consistente + lockfile único
**Status: ⚠️ Parcial**

**Evidências aplicadas**
- Lockfile único no frontend: `frontend/package-lock.json` presente; `frontend/pnpm-lock.yaml` ausente (verificação por listagem de diretório).
- README atualizado para o “happy path” com `npm ci` + compose somente para `wasm-builder`: `README.md:34` e `README.md:108`.
- `docker-compose.yml` explicitamente “WASM build helper only”: `docker-compose.yml:1-2`.
- `Makefile` alinhado em `npm ci` e `up` rodando só `wasm-builder`: `Makefile:8-17` e `Makefile:13-15`.

**Gap**
- `docs/DEV_ENVIRONMENT.md` ainda afirma “full-stack dev Docker setup” com `docker compose up`: `docs/DEV_ENVIRONMENT.md:23-31`, o que contradiz `docker-compose.yml:1-49` e `README.md:108-120`.

## PR1 (P0) — CadViewer: evitar upload/updates por frame
**Status: ✅ Aplicado (com evidência direta)**

- `needsUpdate` passa a ser condicionado por mudanças reais (heap/ptr/floatCount/generation), não por frame: `frontend/src/components/CadViewer.tsx:277-319`.

Observação: o rebind e `needsUpdate` agora dependem de `heapChanged/pointerChanged/floatCountChanged/generationChanged` e atualizam `drawRange` apenas quando necessário: `frontend/src/components/CadViewer.tsx:283-312`.

## PR2a (P0) — Sync TS→WASM: instrumentação/baseline
**Status: ✅ Aplicado**

- Instrumentação “opt-in” em `window.__debugEngineSync` para coletar duração/commands/ops: `frontend/engine/runtime/useEngineStoreSync.ts:40-103`.
- Registro de métricas após `applySync`: `frontend/engine/runtime/useEngineStoreSync.ts:517-520`.

## PR2b (P0) — Sync TS→WASM: reduzir varreduras e sorts no caminho quente
**Status: ✅ Aplicado (com ressalvas)**

**Evidências aplicadas**
- Cache de chaves ordenadas para evitar `.sort()` repetido quando o keyset não muda: `frontend/engine/runtime/useEngineStoreSync.ts:10-38`.
- `computeLayerDrivenReupsertCommands` recebe `orderedShapeIds` para evitar fallback de `Object.keys(shapes).sort` e é chamado com `nextOrderedIds`: `frontend/engine/runtime/useEngineStoreSync.ts:319-350` e `frontend/engine/runtime/useEngineStoreSync.ts:472-475`.
- Early-return quando só `viewScale` muda e o store não mudou: `frontend/engine/runtime/useEngineStoreSync.ts:432-439`.
- Teste de contrato (incremental) adicionado: `frontend/tests/engineStoreSyncIncremental.test.ts:41`.

**Ressalvas**
- Existem `.sort()` remanescentes em caminhos “frio”/one-shot (ex.: initial sync): `frontend/engine/runtime/useEngineStoreSync.ts:538`.
- O helper `getCachedSortedKeys` ainda ordena quando o keyset muda (intencional para determinismo): `frontend/engine/runtime/useEngineStoreSync.ts:33`.

## PR3 (P0) — Tipagem mínima (remover `any` mais perigoso)
**Status: ⚠️ Parcial**

**Evidências aplicadas**
- `updateSharedElectricalProperties` deixou de usar `Record<string, any>` e passou a aceitar `Partial<ElectricalElement>`: `frontend/stores/useDataStore.ts:107` e merge metadata tipado: `frontend/stores/useDataStore.ts:714-716`.
- Worker DXF no import passou a ser `Promise<{ shapes: ImportedShape[]; layers: ImportedLayer[] }>`: `frontend/features/import/usePlanImport.ts:258`.
- Ribbon registry deixou de ser `React.FC<any>` e passou a usar `React.FC<RibbonWidgetProps>`: `frontend/features/editor/components/EditorRibbon.tsx:48`.

**Gaps**
- Ainda existem ocorrências de `any/@ts-ignore` relevantes no frontend (especialmente import DXF/PDF): ex. `frontend/features/import/utils/dxf/dxfToShapes.ts:186` e `frontend/features/import/utils/pdfToShapes.ts:91` (não invalida o PR3 “mínimo”, mas não cumpre a diretriz “evitar any” de forma ampla).
- Em `EditorRibbon`, `RibbonWidgetProps` referencia `typeof activeLayer`, que não existe no escopo de módulo e deve falhar em `tsc` (Vite/Vitest não fazem typecheck): `frontend/features/editor/components/EditorRibbon.tsx:32-34`. Recomenda-se trocar para `Layer | undefined` (ou tipo equivalente).

## PR4 (P1) — Hardening SVG (XSS)
**Status: ✅ Aplicado**

- Sanitização por whitelist de tags/attrs + remoção de `script/foreignObject/on*` e links externos: `frontend/features/library/electricalLoader.ts:29-136`.
- `dangerouslySetInnerHTML` ainda existe, mas agora recebe SVG sanitizado pelo loader (assumindo que toda origem passa por `normalizeSvg`): `frontend/features/library/ElectricalRibbonGallery.tsx:62` e `frontend/features/library/ElectricalLibraryPanel.tsx:124`.

## PR5 (P1) — C++ determinístico + reservas corretas
**Status: ✅ Aplicado**

- GTest pinado (não flutuante): `cpp/CMakeLists.txt:71-75`.
- `reserve` do render agora baseado em budget real (inclui círculos/polígonos/segmentos): `cpp/engine/render.cpp:315-371`.
- `ctest` passou (10/10): ver seção Verification.

## PR6 (P1) — CI mínimo (frontend + cpp)
**Status: ⚠️ Parcial / CI provavelmente quebrado**

- Workflow existe: `.github/workflows/ci.yml:1`.
- Job C++ parece ok (configure/build/test): `.github/workflows/ci.yml:32-48`.

**Problema**
- Job frontend roda `npm test -- --runInBand`: `.github/workflows/ci.yml:29-31`.  
  Isso falha com Vitest: `CACError: Unknown option \`--runInBand\`` (reproduzido localmente via `npm test -- --runInBand`).

## PR7 (P1/P2) — Backend executável/testável
**Status: ✅ Aplicado no código / ⚠️ Não verificado por execução**

- Settings via `BaseSettings` + CORS configurável por env: `backend/app/core/config.py:5-23` e uso no app: `backend/app/main.py:6-14`.
- Models implementados (antes inexistentes) e compatíveis com os testes: `backend/app/modules/engine/models/load.py:12-25` e `backend/app/modules/engine/models/conduit.py:4-17`.
- Teste ainda referencia `app.modules.engine.models.*` (agora existente): `backend/tests/test_engine_models.py:5-6`.

**Limitação desta verificação**
- `python` não está disponível no ambiente usado aqui, então não executei `pytest`.

---

# Gaps (pendências objetivas para “fechar” o plano)

P0/P1:
1) Corrigir docs docker: `docs/DEV_ENVIRONMENT.md` ainda promete full-stack compose (contradição com `docker-compose.yml` e `README.md`).  
2) Corrigir CI frontend: remover `--runInBand` do workflow ou substituir por flag suportada pelo Vitest.  
3) Corrigir tipagem inválida em `EditorRibbon` (`typeof activeLayer` em type alias de módulo).  

P2 (higiene/testes):
4) Remover `console.log` em `frontend/tests/quadtree_repro.test.ts:52-53` (teste ainda passa, mas polui saída).  
5) Reduzir logs de DXF import em testes (muitos `console.log`/stdout durante `npm test`), se o objetivo é “sem warnings/noise” na suite.

