# Code Review Completo (AGENTS.md + subdocs)

Data: 2025-12-21  
Commit: `2cb73786122e6b0867274bd02b5cd9b27e8d4d2a` (branch `feat/shape-improvement`)  
Papel: **Reviewer** (somente leitura; sem mudanças de produto) — conforme `docs/agents/00_operating-model.md`.

## Problem (1 frase)
Reduzir riscos de performance/segurança/manutenibilidade e alinhar o repo às diretrizes do `AGENTS.md` e módulos em `docs/agents/`, com um plano de correção pragmático.

## Plan
1. Mapear estrutura, stack e pontos críticos (frontend/engine/imports/backend/cpp).
2. Extrair regras de `AGENTS.md` + `docs/agents/*` e gerar checklist de compliance.
3. Revisar arquitetura (boundaries UI↔domain↔infra; JS↔WASM).
4. Auditar qualidade de código, segurança e performance (hot paths).
5. Auditar testes, DX/DevEx, observabilidade e CI.
6. Propor PRs pequenos e priorizados (P0/P1/P2).

## Files changed
- Nenhum arquivo de produto alterado. (Este relatório foi adicionado.)

## Risk
Baixo (somente relatório).  
Risco real está nos problemas encontrados; mitigação proposta via PRs pequenos (ver seção D).

## Verification
Não executei `npm test/pytest/ctest` neste ambiente (Python não disponível no container).  
Comandos de inspeção executados (somente leitura): `find`, `rg`, `nl -ba`, `git ls-files`, `git rev-parse`.

---

# A) Executive Summary

Nota geral: ⚠️

## 5 principais riscos
1) Performance: reupload de buffers por frame no R3F (`frontend/src/components/CadViewer.tsx:298-301`).  
2) Performance: sync TS→WASM com varredura+sort global por update (`frontend/engine/runtime/useEngineStoreSync.ts:328+`).  
3) Tipagem: `any/@ts-ignore` em produção e testes (ex.: `frontend/stores/useDataStore.ts:107`, `frontend/features/import/utils/dxf/dxfToShapes.ts:186`).  
4) Segurança: SVG injetado via `dangerouslySetInnerHTML` sem sanitização (`frontend/features/library/ElectricalRibbonGallery.tsx:62`).  
5) DX/Confiabilidade: inconsistência Docker/README e ausência de CI (ex.: `README.md:106-129`, `.github/` ausente).

## 5 principais melhorias recomendadas
1) Gate de update de buffers por geração (P0).  
2) Reduzir custo do sync TS→WASM (P0).  
3) Remover `any` mais perigoso e criar tipos/guards mínimos (P0).  
4) Ajustar README/Docker e padronizar lockfile/gerenciador de pacotes (P0/P1).  
5) Pin do GTest + otimizações de reserve/alocação no C++ (P1).

## “Se eu só pudesse mexer em 3 coisas…”
1) `frontend/src/components/CadViewer.tsx` (evitar reupload por frame).  
2) `frontend/engine/runtime/useEngineStoreSync.ts` (evitar full scans por update).  
3) Onboarding consistente (README/Docker + lockfile único).

## Checklist “dev onboard em 30 min” (alvo)
- Pré-requisitos: Node.js + Docker + (opcional) toolchain CMake/C++ e Python.
- Rodar frontend: `cd frontend && npm ci && npm run dev`
- Rodar testes frontend: `cd frontend && npm test`
- Build WASM: `cd frontend && npm run build:wasm`
- Rodar C++ tests (native): `mkdir -p cpp/build_native && cd cpp/build_native && cmake .. && cmake --build . && ctest`
- Backend (quando ativo): `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload` + `pytest`
- Gap atual: `docker compose up` não sobe full stack (compose tem serviços comentados).

---

## Mapa do Repositório (alto nível)

## Pastas principais
- `frontend/`: React 19 + TypeScript + Vite + Vitest + Tailwind + Zustand + R3F/Three
- `cpp/`: engine C++20 (Emscripten/WASM) + testes GTest (native)
- `backend/`: FastAPI (Python) + Pytest (atual: esqueleto)
- `docs/`: guias (estrutura, testes, dev env) + `docs/agents/*` (regras operacionais)
- `resources/reports/`: relatórios técnicos
- `docker-compose.yml`: builder WASM (serviços frontend/backend estão comentados)

## Linguagens/stack/ferramentas
- Frontend: TS/React/Vite/Vitest/Tailwind/Zustand/R3F/Three (`frontend/package.json`)
- Backend: FastAPI/Pydantic/Pytest (`backend/requirements.txt`)
- Engine: C++/CMake/Emscripten (WASM) + GoogleTest (`cpp/CMakeLists.txt`)
- Docker: `docker-compose.yml` + `docker/Dockerfile.*`
- CI: **não encontrado** (`.github/` ausente)

---

# B) Compliance com AGENTS.md (+ subdocs)

## Fontes carregadas (como “lei”)
- Regras core: `AGENTS.md`
- Operação: `docs/agents/00_operating-model.md`
- Princípios: `docs/agents/10_engineering-principles.md`
- Arquitetura: `docs/agents/20_architecture-rules.md`
- Frontend: `docs/agents/30_frontend-react.md`
- CAD/canvas/modelo: `docs/agents/40_cad-canvas.md`
- WASM/C++: `docs/agents/50_wasm-cpp.md`
- Testes: `docs/agents/60_testing-standards.md`
- Segurança: `docs/agents/70_security-review.md`
- Reporting: `docs/agents/80_reporting.md`

## Checklist de compliance (status + evidência)

### `AGENTS.md` (core)
- ⚠️ **MUST use types / evitar `any`**: há `any` e `@ts-ignore` em produção e testes (ex.: `frontend/stores/useDataStore.ts:107`, `frontend/features/editor/components/EditorRibbon.tsx:32`, `frontend/features/import/utils/dxf/dxfToShapes.ts:186`).
- ⚠️ **MUST NOT refatorar por gosto / mudanças pequenas**: estrutura geral parece respeitada, mas há hotspots que pedem PRs focados (seção D).
- ✅ **WASM build output não deve ser editado manualmente**: doc ok (`docs/PROJECT_STRUCTURE.md:28`), loader ok; risco é mais de *processo* (ver DX).

### `docs/agents/20_architecture-rules.md`
- ⚠️ **Domain logic framework-agnostic / separar efeitos colaterais**: há lógica pesada (picking/snapshot decode) dentro de UI de render (`frontend/src/components/CadViewer.tsx`), e “sync engine” faz varreduras globais a cada update (`frontend/engine/runtime/useEngineStoreSync.ts:328+`).

### `docs/agents/30_frontend-react.md`
- ⚠️ **Evitar derived state / rerender traps / hooks para lógica**: componentes grandes e “smart” (ex.: `frontend/src/components/CadViewer.tsx`) misturam render + queries + picking.
- ⚠️ **IDs**: há uso de `Date.now()`/`Math.random()` em caminhos não-ID e alguns de fallback (`frontend/utils/uuid.ts:33`, `frontend/features/import/utils/layerNameCollision.ts:23`, `frontend/stores/useDataStore.ts:746`).

### `docs/agents/40_cad-canvas.md`
- ⚠️ **Determinismo/reversibilidade**: criar layer com cor aleatória (`frontend/stores/useDataStore.ts:746`) é “ok” como UX, mas não é determinístico; se isso entra em persistência/fixtures, vira fonte de flakiness.
- ✅ **Separar tool intent/model update/render**: há esforço declarado na arquitetura (`frontend/ARCHITECTURE_ANALYSIS.md`), mas execução ainda híbrida (seção 2).

### `docs/agents/50_wasm-cpp.md`
- ⚠️ **Evitar alocações em hot paths**: `engine::rebuildRenderBuffers` cria containers locais por chamada (`cpp/engine/render.cpp:279+`); o reserve de triângulos subestima círculos/polígonos (risco de realloc).
- ✅ **Shared structs POD**: `cpp/engine/types.h` evita `std::string`/ponteiros em structs compartilhadas.
- ✅ **Native testability**: polyfill `emscripten_get_now` presente (`cpp/engine/util.h:10+`).

### `docs/agents/60_testing-standards.md`
- ⚠️ **Determinismo e sem logs ruidosos**: há `console.log` em teste (`frontend/tests/quadtree_repro.test.ts:52-53`).
- ⚠️ **Evitar `any/@ts-ignore` em testes**: mocks usam `as any` (ex.: `frontend/tests/engineRuntime.test.ts:40-51`).

### `docs/agents/70_security-review.md`
- ⚠️ **Não logar PII / validar inputs**: import DXF tem limites de tamanho (bom), mas SVGs são injetados via `dangerouslySetInnerHTML` sem sanitização (`frontend/features/library/ElectricalRibbonGallery.tsx:62`).
- ⚠️ **Backend “thin” e validação**: backend atual é mínimo e sem models/validação real; CORS hardcoded para localhost (`backend/app/main.py:7-18`).

### `docs/agents/80_reporting.md`
- ⚠️ **Naming incremental estável**: há padrões inconsistentes em `resources/reports/` (ex.: múltiplos `report_1_*` e `report_20251221_code_review.md`).

---

# C) Achados por Categoria (com evidências)

## Arquitetura (alto nível)

### O que está bom
- Direção arquitetural está explícita e coerente com a migração para WASM/R3F (`README.md`, `frontend/ARCHITECTURE_ANALYSIS.md`).
- Contratos binários e versionamento: command buffer e snapshot têm “magic/version” e validação no C++ (`cpp/engine/types.h`, `cpp/engine/commands.cpp`, `cpp/engine/snapshot.cpp`).
- Persistência com versionamento + CRC em `frontend/persistence/nextDocumentFile.ts` (boa base para estabilidade de formato).

### Riscos de arquitetura
- **UI↔domain acoplado**: `frontend/src/components/CadViewer.tsx` concentra picking, decode de snapshot, construção de overlays e controle de buffers — aumenta risco de regressão e dificulta otimizações.
- **Sync TS→WASM muito “global”**: `useEngineStoreSync` recalcula ordem visível e revarre dicionários com `.sort()` a cada atualização de store (`frontend/engine/runtime/useEngineStoreSync.ts:328+`), potencialmente O(n log n) por drag.
- **Backend não integrado**: `backend/` parece placeholder, com testes que importam módulos inexistentes (`backend/tests/test_engine_models.py:4-5`).

### Sugestões de refactor com baixo risco
- Extrair “query/picking sobre snapshot” para módulo puro em `frontend/src/next/` (mantém UI fina) — alinhado com `docs/agents/20_architecture-rules.md`.
- Introduzir um “diff” incremental no sync TS→WASM (ex.: subscribe em slices/seletores, ou manter `shapeOrder` como lista completa sempre) para reduzir custo de updates.

### Sugestões maiores (alto impacto) — opcional
- Migrar ferramenta/estado de ferramenta para WASM (já citado no roadmap), mantendo TS apenas como view-model (`frontend/ARCHITECTURE_ANALYSIS.md`).

---

## Achados detalhados

> Formato: **Título** — Categoria | Severidade | Prioridade  
> Onde | Impacto | Recomendação | Exemplo | Risco da mudança

## 3.1 Performance

### 1) Upload de buffer potencialmente “todo frame” no R3F
- Categoria: Performance | Severidade: **Crítico** | Prioridade: **P0**
- Onde: `frontend/src/components/CadViewer.tsx:304+` (loop `useFrame`) e `frontend/src/components/CadViewer.tsx:298-301` (`positionAttr.data.needsUpdate = true`).
- Impacto: pode forçar reupload de VBO a cada frame, degradando FPS e escalabilidade (principalmente com muitos vertices).
- Recomendação:
  1) Setar `needsUpdate` somente quando `meta.generation` mudar (ou quando `ptr/floatCount` mudar).
  2) Evitar trabalho por frame quando nada mudou (gating por geração).
- Exemplo (pseudocódigo):
  - “Se `meshMeta.generation === lastMeshGenRef.current`, não marque `needsUpdate`”.
- Risco da mudança: **médio** (pode afetar atualização visual se o gating estiver errado; mitigar com teste manual + contador de geração).

### 2) Sync TS→WASM com varredura/sort global em cada update
- Categoria: Performance | Severidade: Alto | Prioridade: P0
- Onde: `frontend/engine/runtime/useEngineStoreSync.ts:328-397` e `.sort()` em múltiplos pontos (`:360+`, `:365+`, `:381+`).
- Impacto: custo O(n log n) por atualização (drag, resize, pan), piorando com projetos grandes.
- Recomendação:
  1) Tornar `shapeOrder` lista completa e estável; remover fallback `Object.keys(...).sort` no caminho quente.
  2) Subscribes com seletor (Zustand) por slices relevantes (shapes/layers/visibility/nodes) para reduzir recomputação.
  3) Separar mudanças de `viewScale` e `drawOrder` para não recalcular quando só um shape muda.
- Risco: **médio/alto** (afeta sincronização e consistência do engine; exigir testes de regressão).

## 3.2 Qualidade de código / Tipagem

### 3) `any` em store (quebra regra “MUST use types”)
- Categoria: Código | Severidade: Alto | Prioridade: P0
- Onde: `frontend/stores/useDataStore.ts:107` e implementação `frontend/stores/useDataStore.ts:695-723`.
- Impacto: propaga “unknown” para `metadata`, facilita bugs silenciosos e quebra contrato de tipagem indicado por `AGENTS.md` e `docs/agents/10_engineering-principles.md`.
- Recomendação:
  1) Trocar `Record<string, any>` por tipo explícito (ex.: `Partial<Record<string, string | number | boolean>>` ou `Partial<ElectricalElement['metadata']>`).
  2) Fazer narrowing e validação de chaves aceitas (whitelist) se `metadata` for contrato.
- Risco: **baixo/médio** (mudança local, mas pode exigir ajustes em callers).

### 4) `any`/`@ts-ignore` em pipeline DXF/PDF (inputs não confiáveis)
- Categoria: Código/Security | Severidade: Alto | Prioridade: P0/P1
- Onde: `frontend/features/import/utils/dxf/dxfToShapes.ts:186-201`, múltiplos casts `(entity as any)`; `frontend/features/import/utils/pdfToShapes.ts:91` (`page: any`); `frontend/features/import/usePlanImport.ts:258` (`new Promise<any>`).
- Impacto: fragilidade contra mudanças de `dxf-parser`/`pdfjs-dist`, e pontos cegos de validação em caminhos que recebem input externo (DXF/PDF).
- Recomendação:
  1) Criar tipos locais “minimal contract” para entidades que vocês realmente usam (com `unknown` + guards).
  2) Encapsular acesso a campos opcionais em helpers (ex.: `getDxfText(entity): string`).
- Risco: **médio** (pode exigir ajustes em vários arquivos; mas é incremental).

### 5) Store monolítica com múltiplas responsabilidades
- Categoria: Arquitetura/Código | Severidade: Médio | Prioridade: P1
- Onde: `frontend/stores/useDataStore.ts` (documento + layers + diagram + conexões + history + spatial index + serialização).
- Impacto: aumenta complexidade ciclomática, dificulta testes unitários, e torna performance tuning mais arriscado.
- Recomendação: dividir por slices (ex.: `dataShapesSlice`, `layersSlice`, `historySlice`) preservando API pública (evitar breaking).
- Risco: **alto** se feito “big bang”; mitigar com PRs pequenos e sem mudança de API.

## 3.3 Segurança

### 6) Injeção de SVG via `dangerouslySetInnerHTML` sem sanitização
- Categoria: Segurança | Severidade: Alto | Prioridade: P0/P1
- Onde: `frontend/features/library/ElectricalRibbonGallery.tsx:62`, `frontend/features/library/ElectricalLibraryPanel.tsx:124`.
- Impacto: se `symbol.iconSvg` passar a ser influenciado por usuário/externo (import, sync remoto), vira vetor XSS (SVG pode conter script/event handlers).
- Recomendação:
  1) Sanitize SVG (whitelist de tags/atributos) antes de injetar; ou renderizar via `<img src="data:image/svg+xml;base64,...">` com sanitização.
  2) Garantir que `iconSvg` venha apenas de assets versionados (e manter isso explícito como contrato).
- Risco: **médio** (mudança de render pode afetar estilo/compatibilidade).

### 7) Backend sem configuração por ambiente e sem validação/modelos
- Categoria: Segurança/Arquitetura | Severidade: Médio | Prioridade: P1
- Onde: `backend/app/main.py:7-18`, `backend/app/core/config.py`.
- Impacto: risco de deploy acidental com CORS/credenciais incorretas; ausência de padrões de validação e boundaries (`docs/agents/70_security-review.md`).
- Recomendação:
  1) Migrar config para Pydantic Settings (env vars).
  2) Definir “surface area” mínima (routers) e modelos de request/response.
- Risco: **médio** (depende do quanto backend é usado hoje).

## 3.4 DX / Manutenibilidade / Processo

### 8) Inconsistência Docker/README (onboarding quebra)
- Categoria: DX | Severidade: Alto | Prioridade: P0
- Onde: `README.md:106-129` vs `docker-compose.yml:1-47` e `docs/PROJECT_STRUCTURE.md:33-40`.
- Impacto: `docker compose up` **não sobe** frontend/backend (serviços comentados), contrariando README; aumenta tempo de onboarding e suporte.
- Recomendação:
  1) Ou reativar serviços frontend/backend no compose, ou ajustar README para refletir que compose atual só builda WASM.
  2) Garantir um caminho “happy path” único.
- Risco: **baixo** (docs/config).

### 9) Dois lockfiles (npm + pnpm) no frontend
- Categoria: DX | Severidade: Médio | Prioridade: P0/P1
- Onde: `frontend/package-lock.json` e `frontend/pnpm-lock.yaml` (ambos presentes).
- Impacto: builds inconsistentes, “works on my machine”, dependências divergentes.
- Recomendação: escolher um gerenciador (ex.: npm) e remover o lockfile do outro; documentar em `README.md`.
- Risco: **médio** (pode mudar árvore de deps; mitigar com CI e snapshot de build).

### 10) Ausência de CI mínima
- Categoria: DX/Confiabilidade | Severidade: Médio | Prioridade: P1
- Onde: `.github/` ausente.
- Impacto: regressões entram sem detecção; difícil manter migração WASM com segurança.
- Recomendação: pipeline mínimo (lint opcional, testes frontend, build wasm opcional, testes C++).
- Risco: **baixo** (infra).

## 3.5 Testes

### 11) Teste com `console.log` e caráter de “repro”
- Categoria: Testes | Severidade: Baixo/Médio | Prioridade: P2
- Onde: `frontend/tests/quadtree_repro.test.ts:52-53`.
- Impacto: ruído em CI; tende a virar “teste de debug” permanente.
- Recomendação: remover logs e renomear/ajustar para teste de regressão focado.
- Risco: **baixo**.

### 12) Backend tests quebrados por design (TDD), mas sem isolamento
- Categoria: Testes | Severidade: Médio | Prioridade: P1
- Onde: `backend/tests/test_engine_models.py:4-5` (imports inexistentes).
- Impacto: `pytest` falha; impede adoção de CI e disciplina de testes.
- Recomendação: marcar como `xfail`/skip até implementação, ou implementar os models mínimos.
- Risco: **baixo** (ajuste em testes), **médio** (se implementar domínio).

---

## Top 10 problemas (maior impacto) + Quick wins

## Top 10 (priorizados)
1) P0: Reupload de buffers por frame em `CadViewer` (FPS/escala).  
2) P0: Sync TS→WASM com varredura+sort global por update.  
3) P0: `any/@ts-ignore` em caminhos críticos (store + import).  
4) P0: Docs Docker/README inconsistentes.  
5) P0/P1: `dangerouslySetInnerHTML` para SVG sem sanitização (XSS potencial).  
6) P1: Store monolítica (manutenção/testabilidade).  
7) P1: GTest “main” não pinado (`cpp/CMakeLists.txt:73-75`) — builds não determinísticos.  
8) P1: Backend é placeholder (config/env/validação) e testes falham.  
9) P1: Lockfiles duplos (npm/pnpm).  
10) P2: Logs em testes e logs de UI deixados em produção (ruído).

## Quick wins (baixo risco)
- Remover `console.log` de `frontend/tests/quadtree_repro.test.ts` e manter asserts.
- Ajustar README/Docker para um único “happy path”.
- Substituir `Record<string, any>` por tipo explícito no store e no worker output.
- Em `CadViewer`, marcar `needsUpdate` só quando geração muda.
- Pin do GTest para tag/commit estável no CMake.

---

# D) Plano de Ação em PRs (muito importante)

> Cada PR segue o “Change Discipline” do `AGENTS.md` (Problem/Plan/Files/Risk/Verification) e evita mudanças amplas.

## PR #1 (P0) — “Parar reupload por frame no CadViewer”
- Objetivo: reduzir custo por frame no render R3F (hot path).
- Arquivos prováveis: `frontend/src/components/CadViewer.tsx`
- Passos:
  1) Gating de `needsUpdate` por `meta.generation`/`ptr`.
  2) Garantir que `bindInterleavedAttribute` só execute trabalho quando necessário.
  3) Adicionar medição simples (ex.: contador de updates por geração).
- O que eu vou mudar: apenas lógica de atualização de atributos/buffers.
- O que eu não vou mudar: formato de snapshot/commands; comportamento de ferramentas.
- Risco: médio; mitigação: teste manual com cenas grandes + verificação visual de updates.
- Testes: `cd frontend && npm test`

## PR #2 (P0) — “Reduzir custo do sync TS→WASM (primeiro corte)”
- Objetivo: evitar `.sort()`/full scans no caminho quente de store updates.
- Arquivos prováveis: `frontend/engine/runtime/useEngineStoreSync.ts`, `frontend/stores/useDataStore.ts`
- Passos:
  1) Remover fallback `Object.keys(...).sort` do caminho quente (garantir `shapeOrder` completo).
  2) Separar triggers: viewScale/drawOrder vs shape upserts/deletes.
  3) Medir custo (benchmark simples no `frontend/verification/benchmark_world_snapshot.mjs` ou devtools).
- O que eu vou mudar: somente estratégia de sync e ordem visível.
- O que eu não vou mudar: contrato binário `CommandOp`/payloads; UI/UX.
- Risco: médio/alto; mitigação: testes de import + drag + undo/redo + seleção.
- Testes: `cd frontend && npm test`

## PR #3 (P0) — “Tipagem mínima: eliminar `any` mais perigoso”
- Objetivo: alinhar com `AGENTS.md`/`docs/agents/10_engineering-principles.md` (tipos) com mínimo risco.
- Arquivos prováveis:
  - `frontend/stores/useDataStore.ts` (trocar `Record<string, any>`)
  - `frontend/features/import/usePlanImport.ts` (tipar worker output)
  - `frontend/features/editor/components/EditorRibbon.tsx` (tipar registry/props críticas)
- Passos: introduzir tipos locais e guards sem reestruturar módulos.
- Risco: baixo/médio (TypeScript-only).
- Testes: `cd frontend && npm test`

## PR #4 (P1) — “Hardening de SVG (XSS) e contrato de origem”
- Objetivo: remover vetor XSS potencial do `dangerouslySetInnerHTML`.
- Arquivos prováveis: `frontend/features/library/*`, `frontend/features/library/electricalLoader.ts`
- Passos:
  1) Sanitização (whitelist) ou troca de estratégia de render (`img`/data URL).
  2) Documentar contrato: “SVGs vêm apenas de assets versionados”.
- Risco: médio (render/styling).
- Testes: `cd frontend && npm test`

## PR #5 (P1) — “C++: pin GTest + reduzir alocações evitáveis no render”
- Objetivo: builds determinísticos + menos realloc em buffers.
- Arquivos prováveis: `cpp/CMakeLists.txt`, `cpp/engine/render.cpp`
- Passos:
  1) Pin `GIT_TAG` do googletest para release tag/commit estável.
  2) Ajustar reserva de triângulos para círculos/polígonos (estimativa correta).
  3) Opcional: reutilizar vetores/sets auxiliares para evitar alocações por rebuild.
- Risco: médio; mitigação: `ctest` e smoke via WASM build.
- Testes:
  - `mkdir -p cpp/build_native && cd cpp/build_native && cmake .. && cmake --build . && ctest`
  - `cd frontend && npm run build:wasm`

## PR #6 (P1) — “CI mínimo (frontend tests + cpp native tests)”
- Objetivo: evitar regressões durante migração.
- Arquivos prováveis: `.github/workflows/ci.yml` (novo)
- Passos:
  1) Node setup + `npm ci` + `npm test` (frontend).
  2) CMake + build + `ctest` (cpp).
  3) Backend opcional quando estabilizar (`pytest`).
- Risco: baixo.

## PR #7 (P1/P2) — “Backend: tornar executável e testável”
- Objetivo: alinhar a `docs/agents/70_security-review.md` (validação/config).
- Arquivos prováveis: `backend/app/*`, `backend/tests/*`
- Passos:
  1) Config via env (Pydantic settings).
  2) Criar modelos mínimos referenciados pelos testes ou marcar `xfail` até implementação.
- Risco: médio.
- Testes: `cd backend && pytest`

Dependências (ordem recomendada): PR1 → PR2 → PR3 → PR4/PR5 → PR6 → PR7.

---

# E) Backlog de Melhorias (nice-to-have)

- P2: Quebrar `useDataStore` em slices mantendo API pública.
- P2: Centralizar logging (evitar `console.*` em produção; melhorar mensagens de erro).
- P2: Contrato de import: limites e validações mais explícitas (DXF/PDF/SVG).
- P3: Observabilidade de performance (timers/metrics locais para sync/engine apply).
- P3: Formalizar “public API” entre UI e domínio (types + adapters).

---

## Nota final
O backlog acima é deliberadamente conservador para respeitar `AGENTS.md`: mudanças pequenas, reversíveis e sem alterar comportamento sem aprovação explícita.
