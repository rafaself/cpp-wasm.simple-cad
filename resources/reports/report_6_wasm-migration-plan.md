# Relatório Técnico — Plano de Migração (Canvas2D → WebGL/R3F + C++/WASM) com a aplicação sempre “rodando”

**Data:** 2025-12-18  
**Objetivo do plano:** manter o produto funcionando como hoje, **sem tela branca**, enquanto substituímos a ferramenta/engine de desenho pela nova arquitetura (WASM + R3F) em **etapas com gates**.  
**Modo:** planejamento (sem refatoração nesta entrega).

---

## 1) Diagnóstico rápido do problema atual (“tela em branco”)

Há dois problemas diferentes que podem se manifestar como “tela em branco”:

### 1.1 Ambiente dev instável no Windows/OneDrive (causa provável)

Ao tentar iniciar/buildar o frontend localmente, foi reproduzido erro:

- `Error: spawn EPERM` ao Vite tentar iniciar o `esbuild` (durante load do `vite.config.ts`).

Esse padrão é clássico em Windows quando o repo está em pasta com proteção/virtualização (ex.: OneDrive/Controlled Folder Access), e o `esbuild.exe` não consegue spawnar. Resultado: o dev server não sobe corretamente, e o browser fica sem app (ou com página em branco).

**Mitigação (pré-requisito para qualquer migração):**
- (A) **Mover o repo para fora do OneDrive** (ex.: `C:\dev\EndeavourCanvas\`) **ou**
- (B) **Desenvolver dentro de containers Docker** (Linux) usando `docker compose up` (já configurado), evitando o spawn EPERM **ou**
- (C) Ajustar políticas/antivírus/Controlled Folder Access para allowlist do `esbuild.exe`.

> Sem estabilizar o ambiente de dev, qualquer mudança “de arquitetura” vai parecer que quebrou tudo.

### 1.2 Falhas reais de migração (runtime/TS) — ainda não confirmadas

Mesmo com o ambiente estabilizado, uma tela em branco também pode vir de:
- falha em import dinâmico do `/wasm/engine.js`,
- falta de deps (`three`, `@react-three/fiber`) instaladas,
- exceção runtime em componente que foi introduzido na árvore principal,
- COOP/COEP bloqueando assets externos,
- “Detached ArrayBuffer” se `ALLOW_MEMORY_GROWTH` expandir memória.

**Regra:** só diagnosticar essas causas depois que **Fase 0** (ambiente) estiver passando.

---

## 2) Estratégia-mãe (overthink): “Dual Engine / Dual Renderer” com gates e rollback

### 2.1 Por que “dual” é obrigatório

“Trocar a engine” de uma vez (Canvas2D → WASM + WebGL) implica reescrever simultaneamente:
- render, selection, snapping, hit test, interaction loops,
- spatial index, undo/redo, serialization, imports,
- e toda a UX em volta.

Isso é o caminho mais rápido para regressão total.

**Portanto:** o plano correto é rodar com duas rotas:

1) **Legacy Path (estável):** Canvas2D atual continua sendo o padrão.
2) **Next Path (experimental):** R3F + WASM entra **atrás de feature flag**, com integração incremental.

### 2.2 “Source of Truth” em duas fases (evita reescrever domínio cedo)

**Fase A (migração segura):** Zustand/TS continua como **source of truth** do documento.  
WASM engine começa como **cache/accelerator** (render buffers + spatial queries), alimentada por patches.

**Fase B (migração completa):** WASM vira source of truth e TS store vira view-model (IDs + seleção + UI).  
Só migrar para B quando houver paridade suficiente e testes/instrumentação.

---

## 3) Roadmap em etapas (com critérios de aceite e entregáveis)

### Fase 0 — Estabilização do ambiente (bloqueador)

**Meta:** conseguir rodar frontend e executar builds/testes sem “spawn EPERM”.

**Entregáveis:**
- Definir “ambiente suportado” oficialmente (pelo menos 1):
  - **Dev local fora do OneDrive** (recomendado) OU
  - **Dev 100% em Docker** (recomendado para times/consistência).
- Checklists/documentação no README.

**Gates:**
- `npm run dev` (ou `docker compose up frontend`) sobe sem erro.
- `npm run test` roda.

**Risco se pular:** tudo vira “tela branca” intermitente.

---

### Fase 1 — Camada de Abstração (contrato) entre UI e Engine

**Meta:** criar uma “porta” única para a UI falar com a engine, sem acoplar a UI a Canvas2D ou WASM.

**Decisão:** definir um contrato TS tipo:
- `EngineAdapter` (create/update/delete shapes)
- `RendererAdapter` (mount/unmount, draw, debug overlays)

**Entregáveis:**
- Interface de engine (mínimo):
  - `applyPatches(patches[])`
  - `queryVisible(viewport)` (para culling/picking)
  - `exportSnapshot()` (para debug)
- Feature flag:
  - `ENGINE_BACKEND=canvas2d|wasm`

**Gates:**
- App roda usando `canvas2d` como default, sem regressões.
- Testes de contrato (unit) passando.

**Observação:** nesta fase não muda UX; só se cria o “encaixe”.

---

### Fase 2 — “Triangle” de renderização (WASM buffers → R3F)

**Meta:** provar pipeline “zero-copy no JS”:
- WASM calcula vertices em memória linear,
- JS cria TypedArray views,
- Three usa BufferAttributes e renderiza.

**Entregáveis:**
- Um viewer isolado (rota/tela dev-only) com:
  - 1 retângulo/parede
  - câmera básica e grid/axes
- “dirty generation” mínimo:
  - contador `geometryGeneration` para rebind seguro.

**Gates:**
- Retângulo renderiza sem “Offset out of bounds”.
- Sem “Detached ArrayBuffer” no caminho comum.

**Nota de segurança:** enquanto `ALLOW_MEMORY_GROWTH=1`, o risco de invalidar views existe. Nesta fase:
- aceitar rebind quando `wasmModule.HEAPF32.buffer !== lastBuffer`.

---

### Fase 3 — Render de shapes reais (paridade visual incremental)

**Meta:** desenhar o documento real (shapes existentes) no viewer WebGL, sem interação ainda.

**Abordagem:**
- Converter `Shape` atual → “render primitives” (triangles/lines) em WASM.
- Começar com 1–2 tipos (ex.: `rect`, `line`) e crescer.

**Entregáveis:**
- `RenderExtract` em WASM:
  - recebe batch de shapes (ou patches) e gera buffers
  - aplica culling por viewport
- No TS:
  - sincronizador `store -> wasm` (batch)

**Gates:**
- Documento simples aparece igual (ou quase igual) ao Canvas2D.
- Medição: FPS estável com 10k shapes estáticos (primeiro benchmark).

---

### Fase 4 — Interação (selection/picking/pan/zoom) mantendo UX

**Meta:** portar interação sem quebrar o modelo de ferramentas.

**Regra:** não reescrever todas as tools de uma vez.

**Ordem recomendada:**
1) Camera controls (pan/zoom) em R3F
2) Picking básico (click → entityId)
3) Selection highlight
4) Drag move (uma tool) com commit/undo

**Entregáveis:**
- Sistema de input (JS → WASM) em batch por frame:
  - mouse pos, modifiers, viewport
- WASM devolve:
  - hovered id, selected id candidates, dirty ranges

**Gates:**
- Seleção funciona com o mesmo comportamento do Canvas2D.
- Drag move sem jitter e sem GC spikes.

---

### Fase 5 — Snapping/Spatial Index/Undo-Redo (alto risco)

**Meta:** mover o “core” de precisão e performance para o engine.

**Entregáveis:**
- Spatial index em WASM (grid hash/BVH 2D)
- Snapping em WASM (batch queries)
- Undo/redo:
  - preferível: command log no WASM
  - compatível: continuar usando patches TS e replicar no WASM até “flip de source of truth”

**Gates:**
- Snapping paridade com o atual.
- Undo/redo determinístico (same result) e com testes.

---

### Fase 6 — Flip de source of truth (TS → WASM)

**Meta:** engine em WASM vira o dono do documento.

**Pré-condições obrigatórias:**
- serialização versionada e migrator
- testes de regressão (fixtures)
- observabilidade/perf counters

**Entregáveis:**
- TS stores passam a guardar:
  - seleção, UI state, filtros
  - IDs e caches mínimos
- Documento vive em WASM:
  - snapshot/export controlado

**Gates:**
- Import/export preserva projetos antigos.
- Performance “100k+” comprovada.

---

## 4) Plano de execução (tarefas por disciplina)

### 4.1 DevOps/Toolchain
- Fixar ambiente oficial (fora do OneDrive ou Docker).
- Scripts:
  - `build:wasm` robusto para PowerShell (`docker.exe ...`).
- CI (futuro):
  - build wasm + build frontend + tests.

### 4.2 Frontend (React)
- Introduzir feature flags e rotas dev-only (evitar quebrar UI principal).
- Criar componentes “host”:
  - `CadCanvasLegacy` (Canvas2D)
  - `CadCanvasNext` (R3F viewer)
- Criar camada adapter (Engine/Renderer ports).

### 4.3 WASM/C++ Engine
- Modelo interno com IDs numéricos.
- Buffers:
  - positions/indices
  - “generation” + dirty ranges
- Regras de memória:
  - `reserve` na fase inicial
  - estratégia de rebind quando crescer
  - roadmap para memória estável (arenas) para produção.

---

## 5) Riscos (registro) e mitigação

1) **Detached ArrayBuffer / memory growth**  
   - Mitigação: detectar troca de `memory.buffer` e recriar views.
   - Longo prazo: `ALLOW_MEMORY_GROWTH=0` + capacity planning.

2) **Bridge JS↔WASM chatty**  
   - Mitigação: batch commands, polling mínimo por frame.

3) **Paridade visual (Canvas vs WebGL)**  
   - Mitigação: baseline screenshots + fixtures.

4) **Ferramentas complexas (arcos, texto, SVG)**  
   - Mitigação: migrar por prioridade; manter legacy para tipos não portados (fallback per-shape).

5) **Time sinks de “big bang rewrite”**  
   - Mitigação: feature flags + gates + rollback (sempre possível voltar ao Canvas2D).

---

## 6) Critérios de sucesso (objetivo final)

1) App principal roda como hoje (sem perda de features).
2) Novo renderer substitui o antigo **gradualmente**, com fallback controlado.
3) Engine WASM suporta datasets massivos com 60 FPS (medido e monitorado).
4) Modelo de dados permanece consistente e exportável.

---

## 7) Próximos passos imediatos (ordem recomendada)

1) **Fase 0:** decidir “ambiente oficial” (fora do OneDrive ou Docker) e documentar.
2) Criar um **toggle** “Legacy/Next” na UI (dev-only) para comparar renderers.
3) Portar 1 tipo de shape real (ex.: `rect`) para o pipeline WASM+R3F.
4) Adicionar instrumentação simples (FPS + counters).

---

## 8) Verificação

Como validar que estamos prontos para iniciar a migração:

- Frontend sobe sem `spawn EPERM` (local ou Docker).
- `npm run build:wasm` gera `frontend/public/wasm/engine.{js,wasm}`.
- Viewer experimental é acessível sem afetar o editor principal.

