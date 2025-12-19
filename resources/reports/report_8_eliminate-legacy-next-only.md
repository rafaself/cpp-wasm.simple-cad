# Planejamento (OVERTHINK) — Eliminar “Legacy” e migrar para 100% Nova Arquitetura (WASM/C++ + R3F)

**Data:** 2025-12-19  
**Objetivo inegociável:** remover qualquer caminho/feature flag/renderer “legacy” (Canvas2D/TS como engine) e operar **apenas** com a nova arquitetura (WASM/C++ como core engine + WebGL/R3F como renderer), mantendo compatibilidade de import de projetos antigos via migrações versionadas (one-way).

> Importante: este documento é **planejamento + estudo**. Nenhuma alteração estrutural foi aplicada “por conta” (a execução deve ocorrer somente após autorização explícita).

---

## 1) Definições (para evitar ambiguidade)

### 1.1 O que conta como “LEGACY” neste repo

**Legacy (a ser removido do runtime e do código ativo):**

1) **Canvas2D renderer** (StaticCanvas/DynamicOverlay/ShapeRenderer/etc).  
2) **TS/Zustand “document store” como source of truth** para geometria (ex.: `useDataStore.shapes` como “modelo canônico”).  
3) **Feature flag/toggle** `legacy|next`, “host” que alterna superfícies, e qualquer fallback para “legacy engine”.  
4) **APIs e bridges de compatibilidade** que existam apenas para manter a engine TS operando (ex.: `engine.loadShapes(val shapes)` em C++/Embind).
5) **Nomenclaturas / campos de schema** introduzidos apenas por compatibilidade (“legacy alias fields”).

**Não-legacy (pode permanecer, mas deve respeitar a nova arquitetura):**

- UI (React) e estado puramente de UI (seleção, tool mode, preferências).
- Importadores (DXF/PDF) no TS **desde que** emitam comandos/estrutura para o documento WASM, e não mantenham um documento paralelo TS.
- Migrações versionadas (ex.: `v0 -> v2`), desde que isoladas (módulo `migrations/`) e não contaminem o domínio atual.

### 1.2 Critério “Done” de eliminação de legacy

Um conjunto **mensurável** (gates):

- Não existe código em produção que renderize via Canvas2D.
- `useDataStore.shapes` (ou equivalente) **não** é o source of truth da geometria; a geometria vive no WASM.
- Não existe toggle `legacy|next` no runtime.
- `rg -n "\\blegacy\\b|\\bLegacy\\b" frontend cpp backend` retorna **zero** ocorrências em código de produção (pode existir apenas em `resources/archive/` ou em migrators renomeados para `v0`/`deprecated` sem a palavra “legacy”).

---

## 2) Estado atual (AS-IS) — o que está rodando hoje

### 2.1 Pipeline atual é híbrido (nova UI + engine TS + renderer WASM)

O editor “funciona” porque:

- A interação/ferramentas ainda é feita por `DynamicOverlay` + `useCanvasInteraction` (Canvas2D transparente) que escreve em `useDataStore` (TS).
- O viewer WASM (`CadViewer` + R3F) está sendo alimentado por **reimport do snapshot** gerado a partir do TS store.

**Ou seja:** hoje temos **WASM como renderer/cache**, e o TS ainda é o dono do documento. Isso é “legacy” por definição de source-of-truth.

### 2.2 Principais pontos de “legacy” visíveis no código

Inventário objetivo (não-exaustivo; foco no que é blocker para “next-only”):

**Feature flag / superfícies**
- `frontend/src/engineBackend.ts` (`EngineBackend = 'legacy' | 'next'`)
- `frontend/src/components/CadSurfaceHost.tsx` (switch + fallback legacy)
- `frontend/src/components/LegacySurface.tsx` (surface Canvas2D)

**Canvas2D renderer / interação**
- `frontend/features/editor/components/canvas/*` (StaticCanvas, DynamicOverlay, renderers)
- `frontend/features/editor/interaction/useCanvasInteraction.ts` (core do input & tool state)

**Bridge/compatibilidade TS→WASM (padrão “legacy->wasm”)**
- `frontend/src/components/CadViewer.tsx` contém:
  - comentários “Legacy TS document”, `legacyStats`, fallback “Phase 3”
  - chamadas `engine.loadShapes(...)` e `engine.addWall(...)` (POC)
- `cpp/engine.cpp` contém:
  - `loadShapes(emscripten::val shapes)` (bridge legacy)
  - `addWall` (POC)

**Schema com aliases legacy**
- `frontend/types/index.ts`:
  - `ToolType` mistura tool e entity (`'select' | 'rect' | ... | 'conduit' // legacy`)
  - aliases `connectedStartId/connectedEndId` e comentários “legacy”
  - duplicação de campos (`floorId`, `discipline` repetidos) — dívida técnica relevante para migração

**Conversão “snapshotFromLegacyProject”**
- `frontend/src/next/worldSnapshot.ts`
- `frontend/src/next/wasmDocument.ts`
- testes/bench: `frontend/tests/worldSnapshot.test.ts`, `frontend/verification/benchmark_world_snapshot.mjs`

**Docs/propostas antigas orientadas a “dual engine”**
- `resources/source_of_truth/wasm-migration-plan.md` e `resources/source_of_truth/wasm-migration-backlog.md` assumem “legacy default” e fallback.

---

## 3) Arquitetura alvo (TO-BE) — Next-only, sem legado

### 3.1 Princípio central: “Documento vive no WASM”

**WASM/C++ é o dono do documento**:
- entidades, geometria, índices espaciais, IDs, undo/redo determinístico, regras de ferramenta (idealmente).

**TS/React vira view-model e input shell**:
- estado de UI (tabs, modais, preferências, tool selecionada, seleção atual)
- captura de input (mouse/teclado) e envio em lote para o engine
- renderização via R3F a partir de buffers do WASM

### 3.2 Interop recomendado (para não reintroduzir “legacy” por acidente)

**Evitar Embind para hot paths.** Use C ABI + buffers compartilhados:

- `engine_init(config_ptr)` / `engine_dispose()`
- `engine_get_shared_views(views_ptr)` → offsets/lengths de:
  - buffers de render (`positions`, `indices`, `colors`, `lines`)
  - metadados (`generation`, `dirtyRanges`)
  - buffers de eventos (`pickedId`, `hoveredId`, `snapPoint`, etc)
- `engine_apply_commands(count)`:
  - JS escreve N comandos em um command buffer (shared memory)
  - WASM aplica em lote e atualiza buffers/índices
- `engine_set_input(input_ptr)` + `engine_step(dt)` (se houver “modo contínuo”)

**Regra:** JS não chama “1 função por shape”; JS escreve arrays e chama `apply_commands(N)`.

### 3.3 Modelo de dados (C++ DOD) — sem “Shape: ToolType”

Separar *tool* (UI) de *entity* (documento):

- `ToolId` (UI): `select`, `pan`, `line_tool`, `rect_tool`, etc.
- `EntityKind` (documento): `Line`, `Rect`, `Polyline`, `Circle`, `Arc`, `Polygon`, `Text`, `Symbol`, `Conduit`, etc.

No WASM:
- IDs numéricos (`u32`) **emitidos pelo engine**.
- SoA por kind (ou AoS por kind, desde que estável e sem strings/alloc no hot path).
- atributos comuns: `layerId`, `floorId`, `discipline`, flags (visible/locked), color refs.

### 3.4 Renderização (R3F) — “buffers + generation”

- WASM mantém buffers de triângulos/linhas e uma `generation`.
- JS cria views para `HEAPF32/HEAPU32` (com rebind se `memory.buffer` mudar).
- Atualiza `BufferAttribute` apenas quando `generation` ou dirty ranges mudarem.

### 3.5 Undo/redo determinístico (sem TS patches)

**Target: command log no WASM**:
- Cada ação do usuário vira comando(s) com ordem determinística.
- Undo/redo opera em cima do log (ou checkpoints + replay).
- Export/import inclui:
  - snapshot binário versionado (mínimo)
  - ou command log (mais rico, mas maior)

### 3.6 Persistência e compatibilidade com projetos antigos (sem “legacy” no runtime)

- Definir `ProjectV2` (novo formato) como padrão.
- Manter import “v0/v1” como **migração one-way**:
  - `readProject(any) -> normalize -> ProjectV2`
  - código isolado em `frontend/domain/migrations/v0_to_v2.ts`
  - **sem** depender de Canvas2D ou TS engine para “funcionar”.

---

## 4) Estratégia de migração (para chegar em 100% Next-only)

Você pediu “imediato” e “descartar legacy”. O caminho realista é:

1) **Construir o engine WASM capaz de suportar todas as features indispensáveis**, e então
2) **Cortar o legado de uma vez** (delete Canvas2D + delete TS document engine + delete toggles).

Para isso não virar regressão total, o plano abaixo tem *gates* agressivos e instrumentos.

### Fase A — “Engine-owned document” (mínimo viável para substituir TS store)

**Objetivo:** parar de usar `useDataStore.shapes` como verdade para geometria.

**Entregáveis (C++/WASM):**
- Documento interno com entidades `Line/Rect/Polyline` (já existe via snapshot, mas precisa virar “document state” mutável).
- `apply_commands()` com:
  - Create/Update/Delete por ID numérico
  - Batch operations
- Export snapshot bytes (já existe) + import snapshot bytes

**Entregáveis (TS):**
- `DocumentController`:
  - inicializa engine
  - mantém views/buffers
  - expõe API para UI (create/update/delete, selection, snapping)
- Store TS vira **UI-only**:
  - remove `shapes` do store “principal” (ou substitui por caches read-only do WASM)

**Gate A (obrigatório):**
- Render do documento **sem** ler `useDataStore.shapes`.
- Seleção e pan/zoom funcionais com IDs do WASM.

### Fase B — Portar ferramentas (Tools) para escrever no engine, sem Canvas2D

**Objetivo:** remover `DynamicOverlay/useCanvasInteraction` (Canvas2D).

Opções de design (escolher 1):

**B1) Tools em TS, engine como executor**
- TS mantém o state machine da tool.
- Para snapping/picking, TS consulta engine (WASM).
- Para preview (ghost), TS pede ao engine um “draft buffer” ou desenha overlay em WebGL/UI.

**B2) Tools no WASM (recomendado para “no legacy” + determinismo)**
- JS manda input bruto.
- WASM mantém estado da tool, produz:
  - draft geometry buffers
  - comandos concretos no commit
  - eventos de UI (cursor, hints, snap)

**Recomendação:** B2 reduz duplicação e evita “metade das rules no TS”.

**Gate B:**
- Criar linhas/retângulos/polylines, mover/rotacionar, selecionar, deletar — tudo sem Canvas2D.

### Fase C — Portar todos os tipos e features que hoje dependem de TS shape model

Aqui está o “overthink crítico”: **não dá para deletar o legado** enquanto existir um tipo/render/feature que só o Canvas2D suporta.

Lista (precisa confirmar “escopo mínimo do produto”):

1) `circle`, `polygon`, `arc` → triangulação/linhas em WASM (ok)
2) `text` → decisão técnica:
   - (C1) SDF text (msdf) + atlas (WebGL) — recomendado
   - (C2) text como geometria (outline) — pesado
   - (C3) render text em canvas offscreen e usar como texture — pragmático
3) `svg symbols`:
   - (S1) rasterizar para texture atlas (trade-off quality)
   - (S2) parse SVG path → tesselate (complexo, mas “vector-correct”)
   - (S3) manter símbolos como “instance of pre-baked geometry” (ideal se biblioteca limitada)
4) Conduítes/conexões/elétrico:
   - nós/arestas no engine (grafo + spatial)
   - snapping para connection points

**Gate C:**
- Abrir projetos reais (DXF/PDF), visualizar, interagir, editar e salvar em `ProjectV2`.

### Fase D — “Delete legacy” (corte final)

**Objetivo:** remover qualquer código “legacy” do runtime e (preferencialmente) do repo.

Checklist de remoção (código):
- Remover `frontend/src/components/LegacySurface.tsx`
- Remover `frontend/src/components/CadSurfaceHost.tsx`
- Remover `frontend/src/engineBackend.ts`
- Remover `frontend/features/editor/components/canvas/*` (Canvas2D)
- Remover `frontend/features/editor/interaction/useCanvasInteraction.ts` (ou mover/reescrever para InputController)
- Remover `cpp/engine.cpp:loadShapes` e qualquer API “compat”
- Remover `CadViewer` “Phase 3 fallback” (`loadShapes`/`addWall`)
- Renomear/realocar `snapshotFromLegacyProject` para migrator `v0_to_v2` (sem usar a palavra “legacy”)

Checklist de remoção (docs):
- Atualizar `resources/source_of_truth/wasm-migration-*.md` para Next-only (ou mover para `resources/archive/`).

**Gate D (final):**
- `rg -n "\\blegacy\\b|\\bLegacy\\b" frontend cpp backend` → 0 hits (ou hits apenas em `archive/`).
- Sem toggle de engine.
- Build + tests passando.

---

## 5) Plano de reorganização do projeto (boas práticas + manutenção)

### 5.1 Objetivo: fronteiras claras (UI vs domain vs engine)

Proposta de estrutura (frontend):

```
frontend/
  engine/
    wasm/
      loader.ts
      schema.ts         (gerado a partir de C++ offsets)
      commandBuffer.ts
      views.ts          (typed views + rebind safety)
    document/
      controller.ts     (API para UI)
      events.ts
      persistence.ts    (ProjectV2 read/write)
  domain/
    project/
      schema_v2.ts
      migrations/
        v0_to_v2.ts
  features/
    editor/
      ... (UI components)
```

Regras:
- `features/*` não fala direto com `HEAP*`.
- Toda ponte JS↔WASM passa por `frontend/engine/*`.
- `domain/*` é puro (sem React, sem WASM).

### 5.2 Padronização de nomenclatura (para matar “legacy” por definição)

- Trocar “legacy” por `v0`/`deprecated`/`compat` em migrators (ex.: `v0Project`, `compatProject`).
- Trocar “next” por nomes sem marketing:
  - `engine`, `viewer`, `wasmDocument`, `renderExtract`, etc.

### 5.3 “Single source of truth” de schema interop (sem drift)

No C++:
- `engine_schema.h` define structs POD e offsets.

No build:
- gerar `schema_offsets.json` + `frontend/engine/wasm/schema.ts`.

Gate:
- asserts em dev: byteLength/offsets batem.

---

## 6) Riscos (e como mitigar sem reintroduzir legacy)

1) **Text/SVG** são os verdadeiros “bloqueadores” para deletar Canvas2D.
   - Mitigação: decidir estratégia técnica antes de cortar o legado.
2) **Undo/redo determinístico** é hard. TS patches hoje falham testes (`tests/undoRedo.spec.ts`).
   - Mitigação: mover undo/redo para WASM com command log; tests por fixtures.
3) **Perf e interop**: importar snapshot inteiro a cada alteração (como hoje) não escala.
   - Mitigação: command buffer incremental; rebuild parcial; dirty ranges.
4) **IDs**: TS usa string IDs; WASM ideal é `u32`.
   - Mitigação: UI usa `u32` e mapeia para strings apenas em persistência/migrators.

---

## 7) Verificação / Quality gates (o que medir e onde)

Automatizado (Vitest):
- snapshot encode/decode determinístico (já existe)
- novos testes: command determinism (apply N commands → snapshot bytes iguais)
- testes de migração v0->v2 (fixtures pequenas)

Manual:
- pan/zoom/pick/selection/draw
- import DXF/PDF (fixtures do `frontend/verification/`)

Perf:
- cenário 10k/100k entidades:
  - FPS durante pan/zoom
  - tempo de `apply_commands` e `rebuild`
  - número de rebinds de `memory.buffer`

---

## 8) Perguntas (decisões que você precisa cravar para o “big bang”)

1) **Text**: qual estratégia você aceita?
   - SDF atlas (qualidade alta, trabalho médio) vs canvas texture (rápido) vs outline geometry (pesado).
2) **SVG symbols**: são poucos (biblioteca pequena) ou muitos?
   - Poucos → pré-bake geometry
   - Muitos → atlas/raster + instancing
3) **Persistência**: você quer salvar o documento como:
   - snapshot binário (compacto, rápido), ou
   - command log (auditável), ou ambos?
4) **Compatibilidade de projetos existentes**:
   - Import one-way (v0->v2) é suficiente? (recomendado)
   - Export de volta para v0 é necessário? (fortemente desaconselhado)

---

## 9) Próximo passo (sem execução ainda)

Se você confirmar as decisões da seção 8, eu preparo:

- um backlog executável “next-only” (sem fallback legacy),
- critérios de aceite por etapa,
- e um mapa de refactor/remoção de arquivos com ordem segura.

