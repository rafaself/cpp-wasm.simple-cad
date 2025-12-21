# Plano de Ação – Otimização do Report 22 (Seção D)

Data: 2025-12-21  
Fonte avaliada: `resources/reports/report_22_action-plan-section-d.md`  
Contexto: `resources/reports/report_21_code-review-agents.md` (Seção D)  
Commit de referência (na revisão): `2cb73786122e6b0867274bd02b5cd9b27e8d4d2a`

## Problem (1 frase)
Otimizar o plano executável (Seção D) para reduzir risco, melhorar ordem/escopo e alinhar estritamente com `AGENTS.md` + `docs/agents/*` (Change Discipline, tipagem, boundaries e determinismo).

## Plan (alto nível)
1) Corrigir “pré-requisitos de execução” (onboarding, lockfile único, testes não-verdes) antes de CI.  
2) Quebrar P0s grandes em PRs menores e mensuráveis (instrumentar → otimizar).  
3) Garantir que cada PR tenha DoD objetivo (métrica + testes) e não altere comportamento sem aprovação explícita.  

## Files changed
- `resources/reports/report_23_action-plan-section-d-optimized.md` (novo; este documento)

## Risk
Baixo (somente documento). O objetivo é reduzir risco nos PRs futuros via fatiamento e critérios.

## Verification
Sem execução de testes (documento apenas). Validar na prática com os comandos listados em cada PR.

---

# 1) Avaliação do `report_22_action-plan-section-d.md`

## O que já está bom
- Ordem P0→P1 faz sentido e está alinhada ao `AGENTS.md` (mudanças pequenas e verificáveis).
- Já inclui **exit criteria** e checklist de governança (bom alinhamento com “Change Discipline”).
- PRs atacam os hotspots corretos: `CadViewer` (render), `useEngineStoreSync` (interop), `any` (tipagem), SVG (hardening), C++/GTest (determinismo), CI.

## Ajustes necessários (para deixar “pronto para execução”)
1) Data está com placeholder (“2025-01-xx”); manter datas/commits reais melhora rastreabilidade.  
2) CI (PR6) não deve mencionar backend “continue-on-error” como padrão: isso mascara falhas. Melhor: CI só com frontend+cpp inicialmente; backend entra quando `pytest` estiver verde/xfail justificado.  
3) Falta um PR “pré-P0” para corrigir inconsistências de onboarding (README vs docker-compose) e lockfile duplo (npm+pnpm). Isso é P0 de DX e destrava CI reproducível.  
4) PR2 (“remover .sort no hot path”) é arriscado se feito de uma vez; melhor dividir em 2 etapas (medição → otimização incremental).  
5) PR1 precisa explicitar o cuidado com `ALLOW_MEMORY_GROWTH` (heap pode trocar; já há `heapChanged`): o gating precisa respeitar `ptr/floatCount/buffer` e não só `generation`.  

---

# 2) Plano Otimizado (Seção D revisada)

> Convenções (por PR): **Problem / Plan / Files / Risk / Verification** + “O que vou mudar / O que não vou mudar” (conforme `AGENTS.md` e `docs/agents/00_operating-model.md`).

## PR0 (P0) — “Onboarding consistente + lockfile único”
- **Objetivo:** tornar o repo reproduzível e reduzir atrito antes de otimizações (destrava CI).
- **Problem:** `README.md` promete `docker compose up` full-stack, mas `docker-compose.yml` só tem `wasm-builder` ativo; `frontend/` tem `package-lock.json` + `pnpm-lock.yaml`.
- **Plan:**
  1) Decidir 1 gerenciador (recomendação: `npm` se `package-lock.json` é a fonte) e remover o lockfile do outro.
  2) Ajustar docs para refletir o compose real **ou** reativar serviços (se for objetivo). Se reativar, isso altera UX de dev → pedir aprovação explícita.
  3) Garantir que `Makefile` use o gerenciador escolhido (ex.: `npm ci` em vez de `npm install` para CI).
- **Files (prováveis):** `README.md`, `docs/PROJECT_STRUCTURE.md`, `docker-compose.yml`, `Makefile`, `frontend/package-lock.json` ou `frontend/pnpm-lock.yaml` (apenas remoção do não-usado).
- **O que vou mudar:** somente documentação/processo e padronização de dependências.
- **O que não vou mudar:** runtime/feature behavior.
- **Risco:** médio (árvore de deps pode mudar se trocar lockfile); mitigação: rodar `npm test` e build.
- **Verification:** `cd frontend && npm ci && npm test && npm run build`.

## PR1 (P0) — “CadViewer: evitar upload/updates por frame”
- **Objetivo:** reduzir custo do hot path de render.
- **Problem:** `CadViewer` marca `needsUpdate` no loop de frame (`frontend/src/components/CadViewer.tsx:298-301`), potencialmente gerando reupload frequente.
- **Plan:**
  1) Atualizar atributos/buffers apenas quando `meta.generation` mudar **ou** quando `HEAPF32.buffer` trocar (por `ALLOW_MEMORY_GROWTH`) **ou** quando `ptr/floatCount` mudar.
  2) Garantir que o `drawRange` ainda reflita `vertexCount` atualizado.
  3) Medir: contador interno “updates por geração” (sem `console.log` em produção).
- **Files:** `frontend/src/components/CadViewer.tsx`.
- **O que vou mudar:** apenas lógica de bind/update de atributos R3F.
- **O que não vou mudar:** contratos de snapshot/command buffer; UX/tools.
- **Risco:** médio; mitigação: smoke manual com imports grandes + seleção/zoom/pan.
- **Verification:** `cd frontend && npm test` + validação manual (cenário com muitos shapes).

## PR2a (P0) — “Sync TS→WASM: instrumentação e baseline”
- **Objetivo:** medir custo real do sync sem mudar comportamento.
- **Plan:**
  1) Adicionar métricas internas (tempo por `applySync`, contagem de commands) guardadas em memória (ex.: debug panel / `window.__debug`), sem spam de logs.
  2) Documentar baseline (pequeno/médio/grande) no PR.
- **Files:** `frontend/engine/runtime/useEngineStoreSync.ts` (e opcional UI de debug, se já existir padrão).
- **Risco:** baixo.
- **Verification:** `cd frontend && npm test` + coleta manual de métricas.

## PR2b (P0) — “Sync TS→WASM: reduzir varreduras e sorts no caminho quente”
- **Objetivo:** reduzir O(n log n) por update sem quebrar consistência.
- **Plan (incremental, fatiado):**
  1) Garantir que `shapeOrder` seja completo (ou ter um mecanismo incremental para inserir “missing shapes” **sem** ordenar tudo a cada update).
  2) Trocar loops `Object.keys(...).sort` por estruturas mantidas incrementalmente (ex.: manter lista de ids visíveis + map de visibilidade por layer/floor).
  3) Separar triggers: mudanças de `viewScale` e `drawOrder` não devem recomputar shapes/nodes/symbols.
  4) Adicionar 1–2 testes de contrato para o sync (ex.: “ao atualizar 1 shape, não gerar commands para todos”).
- **Files:** `frontend/engine/runtime/useEngineStoreSync.ts`, possivelmente `frontend/stores/useDataStore.ts`.
- **Risco:** médio/alto; mitigação: PR2a baseline + testes + validação manual em drag/import/undo/redo/seleção.
- **Verification:** `cd frontend && npm test`.

## PR3 (P0) — “Tipagem mínima: eliminar `any` mais perigoso”
- **Objetivo:** cumprir “MUST use types” sem refatorar amplamente.
- **Plan:**
  1) Trocar `Record<string, any>` por tipos explícitos/`unknown` + guards, mantendo compatibilidade.
  2) Tipar o output do worker DXF e substituir `new Promise<any>` por `Promise<...>` tipado.
  3) Tipar `ComponentRegistry`/props críticas sem introduzir `any` (usar `unknown` + narrowing).
- **Files:** `frontend/stores/useDataStore.ts`, `frontend/features/import/usePlanImport.ts`, `frontend/features/editor/components/EditorRibbon.tsx` (e outros onde o tipo “vaza”).
- **Risco:** baixo/médio (TS-only), mitigação: `npm test`.
- **Verification:** `cd frontend && npm test`.

## PR4 (P1) — “Hardening de SVG (XSS)”
- **Objetivo:** remover vetor XSS em `dangerouslySetInnerHTML`.
- **Plan (preferir sem deps novas):**
  1) Sanitizar SVG no loader (parse DOM, remover tags/attrs proibidos: `script`, `foreignObject`, handlers `on*`, `href/xlink:href` externos).
  2) Se precisar de lib (ex.: DOMPurify), justificar dependência e limitar escopo (conforme `docs/agents/20_architecture-rules.md`).
  3) Documentar contrato de origem “assets versionados”.
- **Files:** `frontend/features/library/electricalLoader.ts`, `frontend/features/library/ElectricalRibbonGallery.tsx`, `frontend/features/library/ElectricalLibraryPanel.tsx`.
- **Risco:** médio (mudança de render/estilo); mitigação: revisão visual + testes.
- **Verification:** `cd frontend && npm test`.

## PR5 (P1) — “C++ determinístico (pin GTest) + reservas corretas”
- **Objetivo:** builds determinísticos e menos realloc em rebuild de buffers.
- **Plan:**
  1) Pin do googletest para tag/commit estável em `cpp/CMakeLists.txt` (evitar `main`).
  2) Corrigir `reserve` para círculos/polígonos (estimativa atual subestima segmentos).
  3) Opcional: reuso de vetores auxiliares no render para reduzir alocação por rebuild (apenas se medido como hotspot).
- **Files:** `cpp/CMakeLists.txt`, `cpp/engine/render.cpp`.
- **Risco:** médio; mitigação: `ctest` + build wasm.
- **Verification:**
  - `mkdir -p cpp/build_native && cd cpp/build_native && cmake .. && cmake --build . && ctest`
  - `cd frontend && npm run build:wasm`

## PR6 (P1) — “CI mínimo (frontend + cpp)”
- **Objetivo:** regressão automática mínima e rápida.
- **Plan:**
  1) Criar workflow com 2 jobs obrigatórios: frontend (`npm ci && npm test`) e cpp (`cmake` + `ctest`).
  2) Só adicionar backend ao CI quando `pytest` estiver verde (ou `xfail` explicitamente justificado) no PR7.
- **Files:** `.github/workflows/ci.yml` (novo).
- **Risco:** baixo.
- **Verification:** workflow verde no GitHub.

## PR7 (P1/P2) — “Backend executável/testável (destravar pytest)”
- **Objetivo:** alinhar com `docs/agents/70_security-review.md` e tornar `pytest` confiável.
- **Plan:**
  1) Tornar testes existentes executáveis: implementar modelos mínimos **ou** marcar `xfail`/skip com rationale (até o domínio existir).
  2) Config por ambiente (Pydantic settings) + CORS configurável; manter API layer “thin”.
- **Files:** `backend/app/*`, `backend/tests/*`, possivelmente `backend/requirements.txt`.
- **Risco:** médio.
- **Verification:** `cd backend && pytest`.

---

# 3) Ordem recomendada (dependências)
PR0 → PR1 → PR2a → PR2b → PR3 → PR4/PR5 → PR6 → PR7 → (habilitar backend no CI).

---

# 4) DoD (Definition of Done) por PR (resumo)
- PR0: docs consistentes + 1 lockfile + comandos “happy path” funcionam.
- PR1: updates/binds só em mudanças reais (heap/generation/ptr/len); sem regressão visual.
- PR2a: baseline registrado; sem ruído de logs.
- PR2b: custo por update cai e é demonstrado; sem perda de entidades/ordem/visibilidade.
- PR3: `any` removidos nos hotspots; sem `@ts-ignore` novo.
- PR4: SVG sanitizado/contrato documentado; risco XSS mitigado.
- PR5: `ctest` + wasm build ok; GTest não flutua.
- PR6: CI verde (frontend+cpp) com cache mínimo.
- PR7: `pytest` verde ou `xfail` justificado + config segura por env.

