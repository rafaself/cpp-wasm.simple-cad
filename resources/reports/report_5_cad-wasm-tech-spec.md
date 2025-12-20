# Tech Spec — CAD Elétrico C++/WASM (“Holy Grail Stack”)

**Data:** 2025-12-18  
**Role:** Principal Software Architect + Systems/Performance Engineer  
**Target:** 100k+ entidades, 60 FPS estável, hot paths sem alocação, DOD, C++17/20, WASM `-O3`/LTO/SIMD, React + TS + R3F.

---

## 0) Princípios não‑negociáveis (regras de projeto)

1) **C++ Moderno (C++20 recomendado)**  
   - RAII estrito; sem `new/delete` em código de domínio.  
   - `std::unique_ptr`/`std::shared_ptr` apenas em camadas fora do hot path (ex.: carregamento/IO).  
   - POD/standard layout para dados compartilhados com JS.

2) **Data-Oriented Design (DOD)**  
   - Dados em **arrays contíguos**, com índices numéricos (`uint32_t`) em vez de ponteiros.  
   - Preferir **SoA (Struct of Arrays)** para atributos acessados em lote (bounds, posições, flags).  
   - Evitar hierarquias profundas e virtual dispatch no core.

3) **Zero-Allocation Hot Paths**  
   - `stepFrame()` (simulação/interaction) não pode alocar no heap.  
   - Qualquer resize/realocação acontece fora do frame (ex.: “commit phase”) ou via pools/arenas prealocados.

4) **Interop em lote**  
   - JS→WASM e WASM→JS: chamadas grandes e raras, nunca “1 chamada por entidade por frame”.

5) **“Zero-copy” realista**  
   - Sem cópias *no JS* (TypedArrays apontam direto para `WASM Memory`).  
   - **Sempre haverá cópia GPU** (WebGL buffer upload). O objetivo é reduzir uploads e evitar duplicação JS.

---

## 1) Diagrama — Arquitetura de Memória (CPU C++ → WASM HEAP → JS Views → GPU)

```
             ┌───────────────────────────────┐
             │           C++ Core            │
             │  (World + Systems + Spatial)  │
             └───────────────┬───────────────┘
                             │ writes (no alloc in hot path)
                             ▼
                 ┌───────────────────────────┐
                 │     WASM Linear Memory     │
                 │   (HEAPU8/HEAPF32/etc)     │
                 │                           │
                 │  [Geometry Buffers]       │
                 │    - positions (f32)      │
                 │    - colors (u32)         │
                 │    - indices (u32/u16)    │
                 │  [Entity Tables]          │
                 │    - walls[] / conduits[] │
                 │  [Dirty Ranges + Gen]     │
                 └───────────────┬───────────┘
                                 │ JS creates TypedArray views (zero JS copy)
                                 ▼
                ┌────────────────────────────┐
                │         TypeScript         │
                │  R3F/Three BufferGeometry  │
                │  - BufferAttribute(view)   │
                │  - updateRange / needsUpd  │
                └───────────────┬────────────┘
                                │ WebGLRenderer uploads changed ranges
                                ▼
                      ┌─────────────────┐
                      │   GPU Buffers   │
                      │ (VBO/IBO/UBO*)  │
                      └─────────────────┘
```

**Notas críticas**
- “Zero‑copy” = **TypedArray view direto no HEAP**.  
- Upload para GPU deve ser **incremental** via `updateRange` + `DynamicDrawUsage` (ou estratégia de double buffering).
- Qualquer mudança que cause **realocação da memória WASM** invalida views no JS ⇒ precisa de estratégia explícita (Seção 2.3).

---

## 2) Arquitetura de Dados (Shared Memory Strategy)

### 2.1 Separação: “modelo de domínio” vs “buffers de render”

**Regra:** o domínio (BIM/engenharia) não deve carregar payload de render (SVG, strings grandes, etc.).  

Camadas recomendadas:

1) **Domain Model (WASM)**  
   - Entidades: `Wall`, `Conduit`, `Device`, `Panel`, `Circuit`…  
   - Geometria canônica: segmentos/polilinhas/arcos em unidades do mundo.

2) **Render Extract (WASM)**  
   - Processo determinístico que “extrai” do domínio **buffers prontos para GPU** (pos/idx/color).  
   - Output incremental: escreve ranges alterados e registra “dirty spans”.

3) **Renderer (JS/Three)**  
   - Cria `BufferGeometry` e só marca atualizações quando `generation`/dirty ranges mudarem.

### 2.2 Escolha de layout: AoS vs SoA

**Domínio:** SoA predominante (melhor para queries/physics/spatial/batch math).  
**GPU buffers:** SoA (pos, color, index separados) ou interleaved (dependendo do padrão de upload).  

Recomendação inicial:
- `positions`: `float32` (x,y,z) por vértice
- `colors`: `uint32` packed RGBA (ou `uint8x4`)
- `indices`: `uint32` (para 100k+; use `OES_element_index_uint`)

### 2.3 Memory safety: evitando invalidar ponteiros/views (std::vector resize)

**Problema:** `std::vector` realoca ao crescer ⇒ offsets mudam ⇒ TypedArray views quebram.

**Estratégias robustas (escolher 1 como padrão do projeto):**

**Estratégia A — “Fixed Capacity + Reserve Hard” (recomendada para Fase 2)**
- Cada buffer crítico (`positions`, `indices`, `colors`) é um `std::vector<T>` com `reserve(MAX)` no boot.
- Crescimento além do limite exige uma operação fora do hot path:
  - pausar interação (ou fazer “loading/compaction step”),
  - realocar e **recriar views** no JS (rebind).

**Estratégia B — Arena/Slab Allocator com offsets estáveis (recomendada para longo prazo)**
- Alocador próprio (slabs fixos) dentro da memória WASM.  
- JS referencia **offsets estáveis**; o “vector” vira metadados (size/capacity/offset).  
- Permite crescimento por novos slabs sem mover os antigos (fragmentação controlada).

**Estratégia C — Double Buffer + Swap (para workloads de rebuild)**
- Dois conjuntos de buffers; WASM escreve no “back buffer”, no final troca um ponteiro/handle.  
- JS rebind apenas quando troca geração (menos jitter), porém dobra memória.

**Regra de implementação:** JS nunca guarda `ArrayBuffer` antigo sem checar `memory.buffer` e `generation`.

### 2.4 POD schema (Wall/Conduit) — C++ structs para “shared read”/binário

**Objetivo:** structs com *standard layout*, sem `std::string`, sem `std::vector` dentro, sem ponteiros.

Exemplo (C++20):

```cpp
// engine_schema.h
#pragma once
#include <cstdint>
#include <cstddef>

using EntityId = std::uint32_t;
using LayerId  = std::uint32_t;
using LevelId  = std::uint32_t;

enum class EntityKind : std::uint16_t {
  Wall = 1,
  Conduit = 2,
};

struct alignas(16) Vec3f {
  float x, y, z;
  float _pad; // 16B alignment for SIMD-friendly loads
};

// Wall as a 3D “extrudable” segment (start/end in XY, elevation/height in Z)
struct WallPOD {
  EntityId id;
  LayerId layer;
  LevelId level;
  std::uint16_t kind;        // EntityKind::Wall
  std::uint16_t flags;       // bitset: locked/hidden/reference/…

  Vec3f a;                   // start (x,y,z)
  Vec3f b;                   // end   (x,y,z)
  float thickness_m;
  float height_m;

  EntityId parent_id;        // 0 = none (hosting/containment)
  EntityId material_id;      // BIM semantics
};

// Conduit edge as a connection in a graph (ports/nodes are IDs)
struct ConduitPOD {
  EntityId id;
  LayerId layer;
  LevelId level;
  std::uint16_t kind;        // EntityKind::Conduit
  std::uint16_t flags;

  EntityId from_node;
  EntityId to_node;

  // geometric params for routing (2D/3D)
  float diameter_m;
  float bend_radius_m;
  float clearance_m;

  EntityId system_id;        // circuit/system grouping
  EntityId parent_id;
};

static_assert(std::is_standard_layout_v<WallPOD>);
static_assert(std::is_standard_layout_v<ConduitPOD>);
static_assert(sizeof(Vec3f) == 16);
```

**Nota:** Para “zero‑copy” no render, normalmente você não passa `WallPOD` direto para GPU; você usa `WallPOD` para simulação/semântica e extrai buffers de render.

---

## 3) A Ponte (Interop): Embind vs C ABI, batching e reatividade

### 3.1 API surface minimizada (batch operations)

**Diretriz:** evitar Embind para hot paths. Preferir **C ABI** (`extern "C"`) com tipos primitivos e ponteiros/offsets.

Recomendação de API:

1) **Boot/Init**
   - `engine_init(capacity_config*)`
   - `engine_get_views(views_out*)` retorna offsets/lengths de buffers (positions/indices/colors + dirty info)

2) **Per-frame (JS → WASM)**
   - `engine_set_input(input_state*)` (escreve em shared struct, ou passa ponteiro para struct em HEAP)
   - `engine_step(dt_ms)` (sem alocar)

3) **Per-frame (JS lê WASM)**
   - ler `generation`/dirty ranges em um buffer pequeno e estável  
   - se mudou: marcar `BufferAttribute.updateRange` e `needsUpdate = true`

4) **Bulk edits (commands)**
   - Um “command buffer” em memória compartilhada:
     - JS escreve N comandos (create/move/delete/changeProps)
     - chama `engine_apply_commands(count)`
   - WASM processa e atualiza modelos/índices, fora do hot loop se necessário.

### 3.2 Reatividade (React) — polling eficiente vs callbacks

**Recomendação:** polling no `useFrame` (R3F) lendo apenas:
- `frameGeneration` (u32)
- `dirtyRangesCount` + ranges (pequeno)
- `stats` (opcional)

Evitar callbacks do WASM para React (tendem a:
- piorar debug,
- criar reentrância,
- custar mais no bridge).

### 3.3 Type safety e sincronização TS ↔ C++ (sempre consistente)

**Meta:** TS não deve “adivinhar offsets”.

Estratégia recomendada:

1) **Single Source of Truth:** `engine_schema.h` define structs/offsets.
2) **Gerar artefatos no build:**
   - `schema_offsets.json` com `sizeof` e `offsetof` (gerado por uma tool C++ pequena)
   - `frontend/src/engine/schema.ts` (auto-gerado) com:
     - constantes de offset,
     - tipos TS dos views,
     - asserts em runtime (dev) comparando `byteLength`.
3) **Checks hard-fail em dev/CI:** se offsets divergem, o build falha.

---

## 4) Pipeline de Build & DX (Docker/CMake/Vite/HMR)

### 4.1 Ambiente reprodutível (Emscripten)

**Recomendação:** Docker com `emsdk` fixado por versão.

- Imagem base: `emscripten/emsdk:<pinned>` (ou build próprio com checksum)
- Build via CMake toolchain do Emscripten:
  - `emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release`
  - `cmake --build build-wasm -j`

### 4.2 Flags e otimizações (produção)

Produção:
- `-O3 -flto`
- `-s WASM=1 -s MODULARIZE=1`
- `-s ALLOW_MEMORY_GROWTH=0` (ideal)  
  - se growth for necessário, documentar impacto e rebind de views.
- `-msimd128` + uso de SIMD quando válido (geometria/bounds/raycast batch).

Debug/dev:
- `-O0 -gsource-map` (ou `-Og`)
- asserts ativos
- validações de bounds e invariants

### 4.3 Hot reload (WASM + Vite)

Objetivo: iterar rápido sem reiniciar app.

Estratégia:
1) Vite serve `engine.wasm` + JS glue como assets.
2) Watcher (Node script) recompila WASM incrementalmente.
3) No frontend, um “engine loader” que:
   - detecta novo build (hash/timestamp),
   - descarrega/recicla o engine em modo dev,
   - reidrata estado via snapshot JSON/binary (opcional).

**Nota:** HMR de React não pode depender de reinstanciar `WebAssembly.Memory` no meio do frame; usar um “reload boundary” controlado.

---

## 5) Roadmap de implementação (Fases)

### Fase 1 — Infraestrutura (toolchain, schema, contratos)

**Objetivo:** estabelecer base correta antes de render.

- Definir `engine_schema.h` (PODs e IDs).
- Implementar gerador de offsets (`schema_offsets.json` + TS constants).
- Setup Docker + CMake + Emscripten build (dev/release).
- Definir “World Snapshot” (serialização):
  - JSON para compatibilidade inicial (mais lento),
  - Binário versionado para produção (recomendado).
- Definir sistema de IDs:
  - `EntityId` numérico interno,
  - GUID string opcional para import/export/merge.

**Gate de saída:** TS consegue criar views com offsets verificados e carregar o módulo WASM.

### Fase 2 — “The Triangle” (memória compartilhada e render mínimo)

**Objetivo:** provar a pipeline CPU→HEAP→Three→GPU com atualização incremental.

- Alocar buffers no WASM:
  - `positions_f32`, `colors_u32`, `indices_u32`
  - `dirtyRanges` pequeno (prealocado)
- JS cria `BufferGeometry` com `BufferAttribute` apontando para HEAP.
- Implementar “extractor” simples:
  - renderizar walls como linhas/retângulos extrudidos 2.5D
  - renderizar conduits como polylines
- Dirty ranges:
  - por entidade ou por chunk
  - atualizar apenas ranges tocados

**Gate de saída:** 60 FPS com 100k entidades “estáticas” + pan/zoom, sem GC spikes e sem alocação no frame.

### Fase 3 — “The Interaction” (input → C++ → feedback visual)

**Objetivo:** interação determinística, sem alocação, com picking/spatial index.

- Shared `InputState` (mouse, modifiers, tool, rays, viewport).
- `engine_step(dt)` aplica comandos:
  - hover/pick (batch ray queries)
  - drag move/resize (atualiza transform)
  - snapping (batch)
- Spatial index em WASM:
  - broadphase 2D/2.5D (grid hash / BVH)
  - queries determinísticas e incrementais
- Output para UI:
  - seleção/hover IDs
  - snap markers
  - dirty ranges

**Gate de saída:** drag contínuo em dataset grande sem alocação e com latência baixa.

---

## 6) Riscos de performance (gargalos teóricos) e como monitorar

### 6.1 Gargalos prováveis

1) **Bridge overhead** (JS↔WASM)  
   - Mitigação: comandos em lote + polling mínimo (gen + dirty ranges).

2) **Uploads para GPU**  
   - Mitigação: dirty ranges; chunking; reduzir frequência de update; usar instancing quando aplicável.

3) **Realocação de buffers WASM (invalidando views)**  
   - Mitigação: reserve hard / arena / double buffer; rebind reativo e raro.

4) **Picking/snapping em dataset grande**  
   - Mitigação: broadphase forte (hash/BVH), cache de viewport queries, SIMD para AABB tests.

5) **Fragmentação e pools mal dimensionados**  
   - Mitigação: capacity planning + métricas (high-water marks) + tooling de snapshot.

6) **R3F/React re-render thrash**  
   - Mitigação: manter React fora do loop de render (usar refs, `useFrame`, store mínimo).

### 6.2 Profiling e observabilidade (obrigatório)

No WASM:
- timers internos por sistema (frame budget breakdown)
- contadores de:
  - entidades processadas
  - queries de spatial index
  - ranges sujos
  - bytes enviados ao GPU (estimativa)
- build flags para “instrumentation on/off”

No JS:
- `performance.now()` para medir:
  - `engine_step`
  - custo de aplicar `updateRange`
  - custo do render Three
- Chrome Performance + WebGL insights
- (opcional) EXT_disjoint_timer_query para medir GPU time

**Regra:** todo PR que mexe no core deve anexar números (microbench) para evitar regressões.

---

## 7) Checklist de contratos (Definition of Done da arquitetura)

- [ ] TS views alinhadas com offsets gerados do C++ (falha se divergente).
- [ ] `engine_step` não aloca em runtime (verificado por contador interno/heap hooks).
- [ ] Buffers têm capacidade planejada e estratégia de growth documentada.
- [ ] Dirty ranges atualizam GPU incrementalmente (sem upload full-frame).
- [ ] Grafo/topologia por IDs numéricos e índices derivados (sem varrer mundo no hot path).
- [ ] Modelo BIM: semântica desacoplada do visual (render é derivado).

---

## 8) Notas de integração com o projeto atual (ponte de migração)

O estado atual do app (TS) usa entidades genéricas (`Shape`) e IDs string; a migração recomendada é:

1) congelar um `SerializedProject` versionado
2) criar um “migrator” para `WorldSnapshot` (WASM) com IDs numéricos internos
3) manter compatibilidade por um período (import/export) enquanto a UI migra para R3F

---

## 9) Change log (deste documento)

- Documento criado como “Bíblia Técnica” inicial (sem mudanças no código de produção).

