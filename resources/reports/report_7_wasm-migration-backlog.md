# Backlog Executável — Migração para Nova Arquitetura (Legacy Canvas2D → Next WebGL/R3F + WASM)

**Data:** 2025-12-18  
**Base:** `resources/reports/report_6_wasm-migration-plan.md`  
**Objetivo deste documento:** transformar o plano em um backlog em fases (épicos + tasks), com critérios de aceite (“gates”), ordem recomendada e definição de MVP da Fase 1 (feature flag) **sem tocar no editor principal**.

---

## 0) Princípios de execução (não negociáveis)

1) **Sem Big Bang:** nada de substituir o editor inteiro de uma vez.
2) **App sempre rodando:** o caminho legacy continua default até paridade mínima.
3) **Feature flag + rollback:** todo passo relevante deve ser reversível.
4) **Gates antes de avançar:** cada fase tem critérios verificáveis.
5) **Métricas > opinião:** performance e estabilidade precisam de números (FPS, tempos, contadores).

---

## 1) MVP da Fase 1 (definição exata)

### 1.1 O que é o MVP (escopo)

**MVP Fase 1 = Infra de alternância “Legacy/Next” + Viewer isolado**

- O editor atual (Canvas2D) continua como **padrão**.
- Um **viewer Next** (R3F/WASM) existe em:
  - uma rota/tela dev-only, OU
  - um toggle escondido por feature flag.
- O viewer Next **não participa** do fluxo principal (não substitui ainda o canvas do editor).

**Funcionalidades mínimas do MVP:**
- (A) Toggle de engine (`legacy` vs `next`) em nível de aplicação.
- (B) Renderizar **algo** (ex.: retângulo/parede) via WASM+R3F sem crash.
- (C) Instrumentação mínima: mostrar “engine backend” + geração do buffer + contagem de vértices.
- (D) Fallback garantido: se Next falhar, o app volta para Legacy automaticamente (runtime guard).

### 1.2 O que NÃO entra no MVP

- Seleção, snapping, ferramentas, undo/redo migrados.
- Paridade visual completa.
- Source of truth no WASM.

### 1.3 Gate (critério de aceite do MVP)

- O editor legacy abre e funciona como antes.
- O toggle Next pode ser ligado sem tela branca.
- O viewer Next renderiza a geometria de teste sem:
  - “Offset out of bounds”
  - “Detached ArrayBuffer” no caminho comum
- Build/Dev é reproduzível (ver Fase 0).

---

## 2) Backlog por fases (épicos + tasks)

> Formato: cada fase tem épicos (E) e tasks (T).  
> “Owner” é sugestão (pode ser você ou time).

### Fase 0 — Estabilização do ambiente (bloqueador)

**E0.1 — Definir ambiente oficial de desenvolvimento**
- T0.1.1 Documentar 2 modos suportados:
  - Modo A: repo fora do OneDrive (Windows)
  - Modo B: dev 100% via Docker Compose
- T0.1.2 Adicionar checklist “se tela branca / esbuild EPERM” no README.

**E0.2 — Tornar o dev reprodutível**
- T0.2.1 Fixar comandos:
  - `docker compose up` (frontend/backend)
  - `docker compose run --rm wasm-builder`
- T0.2.2 Ajustar script do WASM para PowerShell (robustez):
  - opção recomendada: usar `docker.exe` explicitamente no script.

**Gates Fase 0**
- Frontend sobe (local ou docker) sem `spawn EPERM`.
- WASM build gera artefatos em `frontend/public/wasm/`.

Owner sugerido: DevOps/Lead dev

---

### Fase 1 — Porta de Arquitetura (Engine/Renderer Adapters) + Feature Flag

**E1.1 — Feature flag de engine**
- T1.1.1 Definir um “engine backend”:
  - `legacy` (Canvas2D)
  - `next` (R3F/WASM)
- T1.1.2 Definir onde essa flag vive:
  - `localStorage` + query param (`?engine=next`)
  - fallback automático para legacy em caso de erro

**E1.2 — “Host components” (sem mexer no editor principal)**
- T1.2.1 Criar um `CadSurfaceHost` (composição) que escolhe:
  - `CadSurfaceLegacy` (existente)
  - `CadSurfaceNext` (novo)
- T1.2.2 Montar `CadSurfaceNext` em uma rota dev-only primeiro (ideal).

**E1.3 — Contrato mínimo TS (EngineAdapter)**
- T1.3.1 Especificar interface “mínima” (apenas o que o viewer precisa):
  - `init()`, `dispose()`
  - `setViewport(...)`
  - `getRenderBuffers()` (pointers/typed views)
  - `getStats()` (debug)
- T1.3.2 Implementar adapter Legacy como “stub” (ou não necessário se viewer isolado).

**Gates Fase 1**
- Flag existe e não quebra nada.
- Viewer Next isolado abre sem afetar o editor.

Owner sugerido: Frontend lead

---

### Fase 2 — Triangle (WASM buffers → JS views → R3F render) com “rebind safety”

**E2.1 — Contrato de buffers (geração + ranges sujos)**
- T2.1.1 Definir um header/struct de “buffer metadata”:
  - `generation`, `vertexCount`, `ptr`, `capacity`, etc.
- T2.1.2 Definir regra de rebind:
  - se `wasmModule.HEAPF32.buffer` mudou, recriar views
  - se `generation` mudou, atualizar geometry/attributes

**E2.2 — Viewer R3F mínimo (sem tools)**
- T2.2.1 Renderizar retângulo fixo (já existe como POC) e exibir stats.
- T2.2.2 Garantir material simples (wireframe) e câmera estável.

**Gates Fase 2**
- Sem crashes ao alternar rotas e reload.
- Sem “Offset out of bounds”.
- Comportamento previsível quando `ALLOW_MEMORY_GROWTH=1` (rebind funciona).

Owner sugerido: Graphics/WASM

---

### Fase 3 — Render do documento real (read-only), por tipos (incremental)

**E3.1 — “Render Extract” (TS → WASM)**
- T3.1.1 Definir formato de entrada:
  - batch de shapes serializados (apenas subset)
  - ou “patch stream”
- T3.1.2 Implementar conversão no lado TS:
  - `Shape` -> chamadas batch (temporário)

**E3.2 — Portar tipos por prioridade**
Ordem sugerida:
1) `line`
2) `rect`
3) `polyline`
4) `circle`
5) `text` (pode ficar no legacy por um tempo)
6) `svg symbols` (provavelmente instancing + atlas/layer toggles)

**Gates Fase 3**
- Documento simples renderiza no Next (read-only).
- Benchmark inicial: 10k entidades estáticas com pan/zoom fluido.

Owner sugerido: Graphics + Frontend

---

### Fase 4 — Interação fundamental (pan/zoom/pick/selection), mantendo UX

**E4.1 — Camera parity**
- T4.1.1 Implementar pan/zoom no viewer Next com a mesma semântica (world coords).

**E4.2 — Picking e seleção**
- T4.2.1 Click -> entity id (broadphase em WASM ou JS temporário).
- T4.2.2 Selection highlight no Next.

**Gates Fase 4**
- Seleção funciona para tipos já portados.
- Sem regressão no legacy.

Owner sugerido: Frontend + Engine

---

### Fase 5 — Tools e features de produtividade (snapping/undo/redo), por “fatias”

**E5.1 — Snapping**
- T5.1.1 Mover broadphase (spatial) para WASM.
- T5.1.2 Implementar snap grid + endpoints (primeiro).

**E5.2 — Undo/Redo**
- T5.2.1 Definir o “log de comando” (WASM) ou “patch bridge” (interino).
- T5.2.2 Testes determinísticos com fixtures.

**Gates Fase 5**
- Snapping paridade para subset de ferramentas.
- Undo/redo determinístico.

Owner sugerido: Engine + QA

---

### Fase 6 — “Flip” de source of truth (TS → WASM) + export/import versionado

**E6.1 — Documento no WASM**
- T6.1.1 Definir snapshot binário versionado (e migrators).
- T6.1.2 TS stores viram view-model (UI-only).

**E6.2 — Paridade e hardening**
- T6.2.1 Performance 100k+ (perfilado).
- T6.2.2 Monitoramento e regressão automatizada (CI).

**Gates Fase 6**
- App completo roda com Next como default (legacy opcional).
- Métricas comprovam 60 FPS em cenários alvo.

Owner sugerido: Principal/Tech lead

---

## 3) Backlog “Tarefas de risco alto” (rastreamento separado)

- R1) `ALLOW_MEMORY_GROWTH=1` vs “views estáveis” (detached/out-of-bounds)
- R2) Paridade de texto/SVG (provável re-arquitetura: atlas/instancing)
- R3) Snapping complexo e precisão numérica (float vs double)
- R4) Undo/redo e determinismo multi-engine

---

## 4) Artefatos esperados por fase (checklist)

- F0: doc + scripts + ambiente estável
- F1: feature flag + host components + rota dev-only
- F2: triangle + rebind safety + stats overlay
- F3: render read-only de shapes reais (subset)
- F4: interação base (pan/zoom/pick/select)
- F5: snapping + undo/redo por fatias
- F6: WASM source of truth + versioned snapshots + perf 100k

---

## 5) Próxima ação recomendada (imediata)

Executar **Fase 0** e, em seguida, abrir PR/branch com **Fase 1 (MVP)**:

1) Toggle `engine=legacy|next` (query param + localStorage).
2) Viewer Next isolado em rota dev-only (não mexe no Editor principal).
3) Fallback automático para legacy em caso de falha ao carregar `/wasm/engine.js`.

