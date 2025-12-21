# Plano de Ação – Execução do Report 21 (Seção D)

Data: 2025-01-xx
Fonte: `resources/reports/report_21_code-review-agents.md` (Seção D – Plano de Ação em PRs)

## Problem (1 frase)
Transformar o backlog de PRs da Seção D em um plano executável e ordenado, alinhado às regras do `AGENTS.md` e submódulos.

## Plan (alto nível)
1) Focar nos P0 (PR1–PR3) para reduzir risco imediato de performance e tipagem.
2) Em seguida endereçar P1 (PR4–PR6) para segurança, determinismo de build e CI.
3) Finalizar com P1/P2 (PR7) para tornar o backend executável/testável.
4) Garantir que cada PR siga Change Discipline: Problem/Plan/Files/Risk/Verification + "O que vou/não vou mudar".

## Tasks executáveis no repositório (ordem sugerida)
- [ ] **PR1 – CadViewer: gate de atualização por geração/ptr**
  - [ ] Ajustar `needsUpdate` e `bindInterleavedAttribute` em `frontend/src/components/CadViewer.tsx` para só reexecutar quando `meta.generation` ou `ptr` mudarem.
  - [ ] Adicionar contador/log de debug opcional para medir updates; retirar antes do merge se gerar ruído.
  - [ ] Testar com `cd frontend && npm test` e smoke manual em cena grande.
- [ ] **PR2 – Sync TS→WASM sem `.sort()` no hot path**
  - [ ] Fixar `shapeOrder` em `frontend/stores/useDataStore.ts` e remover fallback `Object.keys(...).sort`.
  - [ ] Separar triggers de `viewScale/drawOrder` em `frontend/engine/runtime/useEngineStoreSync.ts` usando selectors de Zustand.
  - [ ] Medir custo (devtools/benchmark simples) e registrar no PR; rodar `cd frontend && npm test`.
- [ ] **PR3 – Tipagem mínima nos hotspots**
  - [ ] Tipar `Record<string, any>` nos pontos críticos de `frontend/stores/useDataStore.ts`.
  - [ ] Tipar saída do import (worker/promessa) em `frontend/features/import/usePlanImport.ts` e props do ribbon em `frontend/features/editor/components/EditorRibbon.tsx`.
  - [ ] Executar `cd frontend && npm test`.
- [ ] **PR4 – Hardening SVG (XSS)**
  - [ ] Sanitizar ou trocar renderização para `img`/data URL em `frontend/features/library/*` e `frontend/features/library/electricalLoader.ts`.
  - [ ] Documentar origem controlada dos SVGs; validar com `cd frontend && npm test` + revisão visual.
- [ ] **PR5 – C++ determinístico e menor alocação**
  - [ ] Fixar `GIT_TAG` do googletest em `cpp/CMakeLists.txt`.
  - [ ] Ajustar reserva de triângulos/reuso de buffers em `cpp/engine/render.cpp`.
  - [ ] Rodar `mkdir -p cpp/build_native && cd cpp/build_native && cmake .. && cmake --build . && ctest` e `cd frontend && npm run build:wasm`.
- [ ] **PR6 – CI mínimo (frontend + cpp)**
  - [ ] Criar `.github/workflows/ci.yml` com jobs: Node (`npm ci && npm test`) e CMake (`ctest`).
  - [ ] Considerar job opcional do backend (`pytest`) com `continue-on-error` inicialmente.
- [ ] **PR7 – Backend executável/testável**
  - [ ] Adotar settings por ambiente (Pydantic) e CORS configurável em `backend/app/*`.
  - [ ] Marcar ou corrigir testes em `backend/tests/*`; rodar `cd backend && pytest`.

## Files changed
- `resources/reports/report_22_action-plan-section-d.md` (atualizado com tasks executáveis).

## Risk
Baixo (somente documento). Riscos reais são os itens listados; cada PR deve aplicar mitigação local (testes e escopo pequeno).

## Verification
Nenhum teste executado (alteração só de documento). Confirmar checklist ao rodar comandos citados por PR durante a execução.

---

## Execução Prioritária (P0 → P1)

### P0.1 – Parar reupload por frame no CadViewer (PR1)
- **Objetivo:** Gatear `needsUpdate` por `meta.generation`/`ptr` e evitar trabalho por frame.
- **Escopo:** `frontend/src/components/CadViewer.tsx`.
- **Passos:**
  1) Aplicar gating de `needsUpdate` e de `bindInterleavedAttribute` usando geração/ptr.
  2) Adicionar contador ou log de debug controlado para validar que updates só ocorrem em mudanças reais.
- **Não mudar:** formato de snapshot/commands; comportamento das ferramentas.
- **Testes:** `cd frontend && npm test` + smoke manual em cena grande.

### P0.2 – Reduzir custo do sync TS→WASM (PR2)
- **Objetivo:** Eliminar `.sort()`/varreduras globais por atualização.
- **Escopo:** `frontend/engine/runtime/useEngineStoreSync.ts`, `frontend/stores/useDataStore.ts`.
- **Passos:**
  1) Garantir `shapeOrder` completo/estável; remover fallback `Object.keys(...).sort` do caminho quente.
  2) Separar triggers de `viewScale/drawOrder` vs. mutações de shapes; assinar slices específicos (Zustand selectors).
  3) Medir custo (benchmark simples ou devtools) e registrar no PR.
- **Não mudar:** contratos binários (`CommandOp`/payloads) e UX.
- **Testes:** `cd frontend && npm test`; validar drag/import/undo/redo/seleção.

### P0.3 – Tipagem mínima (remover `any` crítico) (PR3)
- **Objetivo:** Cumprir regra "MUST use types" nos hotspots de store/import/UI.
- **Escopo:** `frontend/stores/useDataStore.ts`, `frontend/features/import/usePlanImport.ts`, `frontend/features/editor/components/EditorRibbon.tsx`.
- **Passos:**
  1) Substituir `Record<string, any>` por tipo explícito/whitelist.
  2) Tipar promessa/worker output e props críticas do ribbon; adicionar guards leves.
- **Não mudar:** API pública das stores; comportamento de ferramentas.
- **Testes:** `cd frontend && npm test`.

### P1.1 – Hardening de SVG (XSS) (PR4)
- **Objetivo:** Remover vetor XSS do `dangerouslySetInnerHTML`.
- **Escopo:** `frontend/features/library/*`, `frontend/features/library/electricalLoader.ts`.
- **Passos:**
  1) Sanitizar (whitelist) ou trocar render para `img`/data URL.
  2) Documentar contrato: assets versionados apenas.
- **Testes:** `cd frontend && npm test` + validação visual.

### P1.2 – C++ determinístico e menos alocação (PR5)
- **Objetivo:** Pin do GTest + ajustar reserva de triângulos/reuso de buffers.
- **Escopo:** `cpp/CMakeLists.txt`, `cpp/engine/render.cpp`.
- **Passos:**
  1) Fixar `GIT_TAG` do googletest.
  2) Corrigir estimativa de triângulos para círculos/polígonos; considerar reuso de vetores.
- **Testes:**
  - `mkdir -p cpp/build_native && cd cpp/build_native && cmake .. && cmake --build . && ctest`
  - `cd frontend && npm run build:wasm`

### P1.3 – CI mínimo (PR6)
- **Objetivo:** Cobrir frontend tests + cpp native tests em GitHub Actions.
- **Escopo:** `.github/workflows/ci.yml` (novo).
- **Passos:**
  1) Node setup + `npm ci && npm test` (frontend).
  2) CMake + build + `ctest` (cpp).
  3) Backend opcional quando estabilizar (pytest) — pode entrar como job separado marcado `continue-on-error` inicialmente.

### P1/P2 – Backend executável/testável (PR7)
- **Objetivo:** Alinhar com `docs/agents/70_security-review.md` (config/validação).
- **Escopo:** `backend/app/*`, `backend/tests/*`.
- **Passos:**
  1) Introduzir config via env (Pydantic settings) e CORS configurável.
  2) Implementar ou marcar `xfail` para testes que referenciam modelos inexistentes.
- **Testes:** `cd backend && pytest`.

## Dependências e Ordem Recomendada
1) P0.1 → 2) P0.2 → 3) P0.3 → 4) P1.1/P1.2 → 5) P1.3 → 6) P1/P2 backend.

## Métricas/Exit Criteria por PR
- P0.1: contador de updates por geração ≤ 1 quando não há mudanças; FPS estável em cena grande.
- P0.2: número de `.sort()` em hot path reduzido; custo de update medido e registrado no PR.
- P0.3: remoção de `any/@ts-ignore` nos pontos citados; tipos novos cobrem chamadas existentes.
- P1.1: nenhum `dangerouslySetInnerHTML` sem sanitização; documentação de origem dos SVGs.
- P1.2: `ctest` passa; build WASM ok; nenhum download flutuante do GTest.
- P1.3: Workflow CI verde cobrindo frontend+cpp.
- P1/P2 backend: `pytest` verde ou testes marcados `xfail` com rationale.

## Checklist de Governança (por PR)
- Problem/Plan/Files/Risk/Verification + "O que vou/não vou mudar" incluídos na descrição.
- Escopo pequeno; sem breaking changes sem aprovação.
- Sem `any` novo; evitar `@ts-ignore`.
- Testes atualizados/rodados conforme escopo.
- Relatório/PR deve citar mitigação e verificação executada.
