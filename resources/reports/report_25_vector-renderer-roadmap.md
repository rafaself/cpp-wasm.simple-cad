**Problema**
- O stack atual (DXF/SVG/PDF → shapes → engine) não foi desenhado como renderer vetorial de alta fidelidade e escala CAD, e por isso aparecem sintomas como gaps em vértices de stroke, limitações de fidelidade de import e ausência de picking pixel-perfect consistente entre backends.

**Objetivo**
- Renderer vetorial escalável e fiel (DXF/SVG/PDF), com **tesselação + cache + tiling**, **picking pixel-perfect**, **WebGPU primário com fallback WebGL2**, e simbologia SVG como instâncias.

**O que eu vou mudar (no programa de PRs)**
- Introduzir um **IR vetorial unificado** (paths/estilos/transforms/clipping), pipeline de tesselação/cache e uma camada de render backend (WebGPU/WebGL2) com picking GPU.
- Migrar incrementalmente sem quebrar o produto: feature flags, paridade visual, validação e métricas.

**O que eu não vou mudar**
- Não vou quebrar serialização/formatos existentes sem plano de migração explícito.
- Não vou alterar ferramentas/editor (undo/redo, snapping, seleção) fora do necessário para integrar o novo renderer e o picking pixel-perfect.
- Não vou editar outputs gerados em `frontend/public/wasm/*`.

---

## Roadmap em fases (cada fase = 1 PR)

### PR0 — Baseline, guardrails e feature-flag
- **Problema:** não há isolamento para evoluir o renderer sem regressões.
- **Plano:** criar `RenderMode`/feature-flag, harness de cenas grandes (fixtures), e métricas (FPS, tri-count, upload time).
- **Arquivos (prováveis):** `frontend/src/components/CadViewer.tsx`, `frontend/engine/runtime/*`, `frontend/stores/*`, `frontend/tests/*`, `resources/reports/*`.
- **Risco:** baixo.
- **Verificação:** `cd frontend && pnpm test` + abrir app e alternar flag.

### PR1 — Interface de RenderBackend + batching (agnóstico de API)
- **Problema:** falta uma fronteira limpa para WebGPU/WebGL2 sem reescrever lógica.
- **Plano:** definir `RenderBackend` (upload/draw/dispose), estrutura de batches/materials, e manter renderer atual como backend legado.
- **Arquivos:** `frontend/engine/*` (novo), `frontend/src/components/CadViewer.tsx`.
- **Risco:** médio (integração).
- **Verificação:** app renderiza idêntico no modo legado.

### PR2 — Picking pixel-perfect por GPU (ID buffer) com fallback
- **Problema:** picking atual é geométrico; precisa ser pixel-perfect e consistente.
- **Plano:** implementar render pass offscreen com `shapeId` (u32) + depth/order; ler 1 pixel no cursor; mapear para id; fallback geométrico temporário sob flag.
- **Arquivos:** `frontend/engine/*`, `frontend/src/components/CadViewer.tsx`, `frontend/tests/*`.
- **Risco:** médio/alto (sincronização GPU→CPU, performance).
- **Verificação:** testes de picking + validação manual em zoom alto.

### PR3 — IR vetorial unificado (versão 1) + migração “sidecar”
- **Problema:** DXF/SVG/PDF convergem em shapes distintos; fidelidade/escala ficam difíceis.
- **Plano:** criar IR TS (path segments, fill/stroke, transforms, clip stack, winding rule), e armazenar como “sidecar” (sem quebrar shapes existentes) + migração controlada.
- **Arquivos:** `frontend/types/*`, `frontend/next/worldSnapshot*` (se necessário), `frontend/features/import/utils/*`.
- **Risco:** médio (modelo).
- **Verificação:** snapshot/undo/redo continuam; IR é gerado sem render ainda.

### PR4 — Tesselação WASM/C++ (fill + stroke) para IR v1
- **Problema:** qualidade tipo Figma exige stroke com joins/caps/inside-only e fill com regras corretas.
- **Plano:** implementar no C++:
  - flatten/adaptação de curvas → segmentos (tolerância por zoom),
  - **tesselação de fill/stroke** para triângulos,
  - **cache** de geometria (re-tessela só quando path/style muda),
  - batching/instancing e ordenação por material.
- **Arquivos:** `cpp/engine/*` (novos módulos), `cpp/tests/*`, `frontend/engine/runtime/commandBuffer.ts` (somente se adicionar uma via nova; preferir manter contrato e criar um “vector buffer” separado).
- **Risco:** alto (core render).
- **Verificação:** `cpp/build_native ... ctest` + `frontend && pnpm build:wasm` + cenas comparativas.

### PR5 — Vector Renderer (WebGL2 primeiro) consumindo buffers tessellated
- **Problema:** falta render vetorial real no client.
- **Plano:** implementar backend WebGL2 que desenha triângulos (fill/stroke) + AA por coverage/fringe; batching por material; integração com picking pass.
- **Arquivos:** `frontend/engine/renderers/webgl2/*`, `frontend/src/components/CadViewer.tsx`.
- **Risco:** alto.
- **Verificação:** paridade visual nos casos básicos; stress test (pan/zoom).

### PR6 — WebGPU backend + paridade com WebGL2
- **Problema:** WebGPU precisa ser primário para teto de performance; fallback WebGL2 obrigatório.
- **Plano:** implementar backend WebGPU (pipelines, bind groups, buffers, picking texture); garantir que mesma cena produz o mesmo resultado visual/IDs.
- **Arquivos:** `frontend/engine/renderers/webgpu/*`.
- **Risco:** alto (API + compat).
- **Verificação:** feature-detect; comparar screenshots/IDs em testes determinísticos quando possível.

### PR7 — Import SVG de alta fidelidade para IR + instancing de simbologia
- **Problema:** simbologia elétrica SVG precisa fidelidade alta e performance (instancing).
- **Plano:** SVG → IR:
  - suportar transforms, groups, clipPath, stroke styles, fills, even-odd/nonzero
  - normalizar em “símbolo” com cache/tesselação única + instâncias com transform
- **Arquivos:** `frontend/features/library/*`, `frontend/features/import/utils/*`, `frontend/engine/*`.
- **Risco:** alto (SVG é amplo).
- **Verificação:** suite de SVGs reais + pixel-perfect picking sobre símbolos.

### PR8 — Import PDF de alta fidelidade para IR (paths + clipping + transforms)
- **Problema:** PDF é fonte de muita geometria; fidelidade exige reproduzir ops e clipping.
- **Plano:** PDF.js ops → IR:
  - path ops, CTM stack, clipping, stroke params, fills/strokes
  - dedupe/cache por página/objeto
- **Arquivos:** `frontend/features/import/utils/pdfToShapes.ts` (refatorar para IR), `frontend/features/import/utils/*`, testes.
- **Risco:** alto.
- **Verificação:** PDFs complexos + métricas de tempo/memória.

### PR9 — Import DXF para IR + otimizações CAD (tiling, simplificação, LOD)
- **Problema:** DXF grande exige LOD e culling agressivo.
- **Plano:** DXF → IR, particionar por layer/tiles, simplificar segmentos por tolerância, LOD por zoom; manter snapping/seleção.
- **Arquivos:** `frontend/features/import/utils/dxf/*`, engine cache/tiling.
- **Risco:** médio/alto.
- **Verificação:** DXFs grandes; métricas comparadas.

### PR10 — Hardening: regressões, benchmarks e relatórios
- **Problema:** sem guardrails, performance e fidelidade degradam rápido.
- **Plano:** adicionar benchmarks reproduzíveis, testes determinísticos (picking/tri-count), relatórios em `resources/reports/` seguindo `docs/agents/80_reporting.md`.
- **Arquivos:** `frontend/tests/*`, `cpp/tests/*`, `resources/reports/*`.
- **Risco:** baixo/médio.
- **Verificação:** pipeline de testes + benchmarks locais.

---

## Prompts por PR (para o Codex executar em sequência)

> Use exatamente um prompt por PR. Cada prompt já exige: **Problem, Plan, Files changed, Risk, Verification** e uso de feature flags para evitar regressões.

### Prompt PR0
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR0 (baseline + feature-flag) no repo. Regras: não alterar comportamento por padrão; introduzir `RenderMode`/feature-flag para alternar renderer (legado vs novo). Adicionar harness de “cena grande” (fixtures) e métricas básicas (FPS estimado, tri-count, upload time) exibidas só em modo dev. Inclua Problem/Plan/Files/Risk/Verification no final. Rode `cd frontend && pnpm test`. Não mexa em outputs WASM.

### Prompt PR1
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR1: crie a interface `RenderBackend` (upload/draw/dispose), estrutura de batches/materials, e encaixe o renderer atual como backend legado mantendo comportamento idêntico quando a flag estiver em “legacy”. Não crie dependências externas. Inclua testes mínimos de smoke. Finalize com Problem/Plan/Files/Risk/Verification. Rode `cd frontend && pnpm test`.

### Prompt PR2
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR2: picking pixel-perfect por GPU via ID buffer. Para WebGL2: render pass offscreen com cor/uint que encode `shapeId` + leitura de 1 pixel no cursor. Integre com seleção existente sem quebrar snapping/undo. Coloque atrás de feature-flag e mantenha fallback geométrico. Adicione testes (vitest) para mapeamento id e fluxo básico. Finalize com Problem/Plan/Files/Risk/Verification e rode `cd frontend && pnpm test`.

### Prompt PR3
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR3: defina um IR vetorial unificado em TypeScript (paths/segments, style, transforms, clip stack, fill rule). Armazene como sidecar sem quebrar serialização existente; se tocar snapshot, inclua migração explícita e retrocompatível. Não renderize ainda. Adicione testes para serialização/migração. Finalize com Problem/Plan/Files/Risk/Verification e rode `cd frontend && pnpm test`.

### Prompt PR4
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR4: no C++ (WASM), implemente tesselação de fill+stroke para IR v1 (flatten de curvas com tolerância em screen-space, joins/caps/dash, stroke-align inside/center/outside, miterLimit, winding rules, clipping básico se suportado). Sem alocações no hot path; reusar buffers e `reserve`. Adicionar testes C++ nativos. Integre build WASM (`pnpm build:wasm`) sem editar outputs gerados. Finalize com Problem/Plan/Files/Risk/Verification. Rode `cpp/build_native...ctest` e `cd frontend && pnpm build:wasm`.

### Prompt PR5
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR5: backend WebGL2 que consome buffers tessellated do WASM e renderiza com batching + AA por coverage/fringe. Integre picking pass (PR2) para o modo novo. Mantenha flag default em legacy. Adicione um teste/fixture de regressão visual simples (se existir padrão no repo) ou pelo menos invariantes (tri-count/picking). Finalize com Problem/Plan/Files/Risk/Verification. Rode `cd frontend && pnpm test`.

### Prompt PR6
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR6: backend WebGPU com a mesma interface do WebGL2, feature-detect e fallback automático para WebGL2 quando WebGPU indisponível. Implementar também o pass de picking. Garantir paridade de blending/AA. Finalize com Problem/Plan/Files/Risk/Verification. Rode `cd frontend && pnpm test` (e inclua instruções manuais para validar WebGPU).

### Prompt PR7
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR7: import SVG de alta fidelidade para IR (transforms, groups, clipPath, fill rules, stroke styles). Implementar “símbolo” cacheado + instancing (tessela 1x, desenha N instâncias). Garantir picking pixel-perfect sobre instâncias. Finalize com Problem/Plan/Files/Risk/Verification e rode `cd frontend && pnpm test`.

### Prompt PR8
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR8: import PDF de alta fidelidade para IR usando pdf.js ops (paths, CTM stack, clipping, fills/strokes). Dedup/cache por página. Garantir picking pixel-perfect. Finalize com Problem/Plan/Files/Risk/Verification e rode `cd frontend && pnpm test`.

### Prompt PR9
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR9: import DXF para IR com otimizações CAD (tiling/quadtree, simplificação por tolerância, LOD por zoom). Garantir que seleção/snapping continuam corretos e que picking pixel-perfect bate com o render. Finalize com Problem/Plan/Files/Risk/Verification e rode `cd frontend && pnpm test`.

### Prompt PR10
Use como referência: `resources/reports/report_25_vector-renderer-roadmap.md`.

Implemente PR10: hardening com benchmarks e guardrails. Adicionar testes determinísticos (picking, tri-count, perf budget), scripts de benchmark e um relatório em `resources/reports/` seguindo `docs/agents/80_reporting.md`. Finalize com Problem/Plan/Files/Risk/Verification e rode o conjunto de testes.

---
