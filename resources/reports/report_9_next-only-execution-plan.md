# Plano executável (Next-only) — eliminar legado e migrar 100% para WASM/C++ + R3F

**Data:** 2025-12-19  
**Status:** planejamento (sem execução aplicada)  
**Mandato (inegociável):** remover qualquer caminho “legacy” (Canvas2D + TS engine como source-of-truth) e operar somente com a nova arquitetura, priorizando performance e UX.

---

## 0) Suas decisões (confirmadas) e implicações

### 0.1 Texto (mais performático + UX rica)

**Escolha recomendada:** **MSDF atlas + instancing (quads por glyph)**.

Por quê:
- É o melhor trade-off “qualidade + performance + flexibilidade” no WebGL.
- Permite zoom infinito sem blur (contornos nítidos) e bom anti-alias.
- Permite **bold/italic/alinhamento/tamanho** com baixa sobrecarga:
  - bold/italic via **font faces** (Regular/Bold/Italic/BoldItalic) + atlas por face
  - alinhamento e tamanho via layout + escala de instância

**Nota importante:** “mais performático” depende do escopo de fontes:
- Se o produto usar poucas fontes (recomendado), dá para **pré-bundlar** os atlases e o layout é baratíssimo.
- Se precisar de fontes arbitrárias do usuário, a geração dinâmica de atlas existe, mas vira “carregamento/worker” (fora do hot path).

### 0.2 SVG symbols

**Escolha:** **atlas/instancing**.

Interpretação prática:
- Converter símbolos (SVG) em uma representação GPU-friendly:
  - instanced meshes (pré-bake geometry por símbolo) quando a biblioteca é finita (recomendado)
  - atlas (texture) + instancing quando a biblioteca é grande/variável (trade-off de fidelidade)

### 0.3 Persistência

**Escolha:** **snapshot binário + command log**.

Implicações:
- Snapshot = “checkpoint” rápido para abrir arquivos grandes.
- Command log = auditabilidade, undo/redo robusto, “replay” determinístico, e migrações futuras mais fáceis.

### 0.4 Compatibilidade com projetos antigos

Você explicitou que **não precisa de conversão de projetos legados**.

Isso muda o meu plano anterior:
- Não precisamos manter `snapshotFromLegacyProject`/aliases compat/etc por “janela”.
- Podemos fazer a transição **agressiva**, inclusive removendo schema/fields “compat” e o engine flag.

Se minha pergunta anterior sobre compatibilidade não tinha a ver com sua resposta: ela tinha (era para decidir se precisávamos de import v0/v1). Com sua resposta, o caminho é: **sem compat, sem migrações históricas por agora**.

Recomendação mínima mesmo sem compat: manter um `magic + version` no snapshot **só para forward-compat interna** (não é “compat com legado”; é proteção para o futuro). Se você realmente não quer versionamento nem header, dá pra tirar — mas aumenta o risco de “quebrar o save” na primeira evolução do schema.

---

## 1) Diagnóstico (por que “legacy” ainda existe de fato)

Mesmo com o viewer WASM funcionando, o sistema ainda é híbrido:

- **Ferramentas/interação** ainda são Canvas2D (`frontend/features/editor/components/canvas/*` + `frontend/features/editor/interaction/useCanvasInteraction.ts`).
- **Documento canônico** ainda vive no TS store (`frontend/stores/useDataStore.ts`) e o WASM é alimentado por reimport.
- Existem restos explícitos de compat/legacy:
  - `frontend/src/components/CadSurfaceHost.tsx`, `frontend/src/engineBackend.ts`, `frontend/src/components/LegacySurface.tsx`
  - `cpp/engine.cpp` com `loadShapes(...)` e `addWall` POC
  - `frontend/src/components/CadViewer.tsx` com fallback “Phase 3” (`loadShapes`, `addWall`) e “legacyStats”
  - `frontend/types/index.ts` com aliases `connectedStartId/connectedEndId` e comentário “legacy”

**Conclusão:** “remover legacy” não é só apagar arquivos — é trocar o **source of truth** e o **local onde as tools vivem**.

---

## 2) Arquitetura alvo (TO-BE) — Next-only

### 2.1 Uma frase

**WASM/C++ é o documento + regras + performance; TS/React é UI + input + composição.**

### 2.2 Componentes propostos (com responsabilidades rígidas)

**WASM (cpp/)**
- Document model (entidades, IDs, layers, floors, disciplines)
- Tool state machines (recomendado) ou “command executor”
- Spatial index (picking/snapping) no engine
- Undo/redo determinístico (command log)
- Render extract: buffers GPU-friendly + dirty ranges

**TS (frontend/)**
- `EngineRuntime`:
  - carrega wasm, mantém views, rebind safety, command buffer
  - expõe API para UI (sem vazar HEAP)
- UI stores:
  - seleção (IDs do engine)
  - tool selecionada (UI)
  - preferências e estado visual
- Persistência:
  - salvar snapshot + log
  - abrir snapshot + aplicar log (ou só snapshot)

### 2.3 Contratos (interop)

1) `engine_apply_commands(n)` com command buffer em memória compartilhada (JS escreve N comandos).
2) `engine_get_render_views()` retorna ponteiros/offsets/contagens para:
   - triangles positions/indices/colors
   - lines positions/colors
   - text glyph instances (se texto for instanced)
   - metas: generation + dirty ranges
3) `engine_set_input(input)` / `engine_step(dt)` (opcional, se tool estiver no engine).
4) `engine_pick(...)` / `engine_snap(...)` (se preferir chamadas explícitas no início).

**Regra:** nenhuma “1 chamada por entidade por frame”.

---

## 3) Estratégia de execução (com gates agressivos) — “Delete legacy” com segurança

### Fase 0 — Preparação (não altera produto, só “porta” correta)

**Objetivo:** garantir que a migração não vire um emaranhado.

Entregáveis:
- Criar diretórios e limites:
  - `frontend/engine/*` (ponte WASM)
  - `frontend/domain/*` (schemas puros)
- Definir IDs do engine como `u32` end-to-end na UI (seleção, pick, etc).

Gate:
- build/test continuam passando.

### Fase 1 — Documento no WASM (mutável) + commands

**Objetivo:** parar de “reimportar snapshot do TS store” e tornar o engine editável incrementalmente.

Entregáveis (WASM):
- Implementar document model mutável para subset inicial:
  - `Line`, `Rect`, `Polyline` (mínimo)
- Implementar command buffer:
  - `CreateEntity`, `DeleteEntity`, `UpdateTransform/Points`, `SetLayer`, `SetStyle`
- Implementar snapshot writer/reader do documento (para checkpoint).
- Implementar render extract incremental:
  - `generation` + dirty ranges (por buffer)

Entregáveis (TS):
- `EngineRuntime` escreve comandos no buffer e chama `engine_apply_commands`.
- UI lê apenas as views de render para desenhar; TS não recalcula geometria.

Gate:
- desenhar um conjunto de entidades por comandos, renderizar via buffers, sem depender de `useDataStore.shapes`.

### Fase 2 — Tools no engine (interação sem Canvas2D)

**Objetivo:** remover `DynamicOverlay/useCanvasInteraction` e fazer ferramentas determinísticas, rápidas, e reversíveis.

Escolha (recomendada): tools state machine no WASM.

Entregáveis:
- Input struct compartilhada (mouse pos, buttons, modifiers, viewport transform)
- Tool set mínimo (para substituir o uso diário):
  - select + box select
  - pan/zoom
  - line/polyline/rect
  - move/rotate (transform)
  - delete
- Draft geometry buffers (preview) também via WASM (sem canvas overlay).

Gate:
- “operar” o editor sem qualquer Canvas2D ativo.

### Fase 3 — Texto (MSDF instanced) com UX mínima completa

**Objetivo:** texto no engine, render em WebGL, com operações básicas exigidas.

Entregáveis (engine + renderer):
- Text entities no documento:
  - string (armazenamento em blob/table no WASM; não em hot path)
  - font face id, size, align, bold/italic flags
- Layout (2 estágios):
  - estágio 1: ASCII/Latin básico + kerning simples (rápido para entregar)
  - estágio 2: shaping via HarfBuzz (WASM) se necessário
- Render: instanced quads por glyph:
  - atributos: `pos`, `uv`, `color`, `scale`, `rotation`, `faceId`, `glyphId`
- Editor UX:
  - overlay HTML para edição (textarea) para melhor UX
  - commit gera comando `SetTextRun(...)`

Gate:
- criar/editar texto: bold/italic, size, alignment, move/rotate, undo/redo.

### Fase 4 — Símbolos (atlas/instancing)

**Objetivo:** substituir render SVG/canvas por instancing/atlas.

Entregáveis:
- Pipeline de ingestão de símbolos:
  - offline build step que converte SVG -> geometry + metadata
  - runtime: instancing (pos/rot/scale/layer)
- Selection/picking por símbolo

Gate:
- biblioteca de símbolos renderiza com performance, sem strings SVG no hot path.

### Fase 5 — Elétrico/conexões/conduits (core do produto)

**Objetivo:** mover as regras e o grafo de conexões para o engine.

Entregáveis:
- Nodes/edges no documento WASM
- Snapping para connection points (broadphase no engine)
- Regras: auto-anchor, detach/pin, etc.

Gate:
- operações básicas de elétrica funcionam sem TS “conduit legacy aliases”.

### Fase 6 — Persistência final (snapshot + command log)

**Objetivo:** salvar/abrir arquivos grandes sem regressão.

Entregáveis:
- formato binário:
  - snapshot + log
  - checksums (ex.: CRC32) e/ou hash para validação
- estratégia:
  - abrir snapshot
  - replay do log desde o snapshot (ou log vazio se snapshot “full”)

Gate:
- abrir/salvar e continuar trabalhando com undo/redo consistente.

### Fase 7 — Delete Legacy (remoção física)

**Objetivo:** remover qualquer vestígio de Canvas2D/dual-engine/aliases.

Checklist (código):
- Remover `frontend/src/components/CadSurfaceHost.tsx`
- Remover `frontend/src/components/LegacySurface.tsx`
- Remover `frontend/src/engineBackend.ts`
- Remover `frontend/features/editor/components/canvas/*` (Canvas2D)
- Remover `frontend/features/editor/interaction/useCanvasInteraction.ts`
- Remover em C++:
  - `CadEngine::loadShapes(emscripten::val)`
  - `CadEngine::addWall` POC
- Limpar `frontend/src/components/CadViewer.tsx`:
  - remover fallback “Phase 3”
  - remover `legacyStats`/strings “legacy->wasm”
- Limpar `frontend/types/index.ts`:
  - remover aliases `connectedStartId/connectedEndId`
  - separar ToolType (UI) de EntityKind (documento)

Checklist (docs):
- Arquivar docs que pressupõem dual engine (`resources/source_of_truth/wasm-migration-*.md`), ou reescrever para Next-only.

Gate final:
- `rg -n "\\blegacy\\b|\\bLegacy\\b" frontend cpp backend` sem hits em código de produção.

---

## 4) Organização do projeto (boas práticas para não “regredir para legacy”)

Regras de ouro:
- UI não acessa `HEAP*` diretamente.
- Domain (schemas) não depende de React nem de WASM.
- EngineRuntime é a única porta JS↔WASM.
- Tool logic não fica espalhada em componentes.

Estrutura sugerida (executável):

```
frontend/
  engine/
    runtime/
      EngineRuntime.ts
      commandBuffer.ts
      views.ts
      input.ts
      errors.ts
    persistence/
      save.ts
      load.ts
  domain/
    document/
      entities.ts
      layers.ts
      ids.ts
  features/
    editor/
      ui/...
      hooks/...
```

---

## 5) Estratégia de testes (precisa existir antes do “delete legacy”)

Unit/contract:
- “apply N commands → snapshot bytes determinísticos”
- “undo/redo determinístico no engine”
- “text layout invariants” (alinhamento/size/face)

Perf regression (mínimo):
- fixture 10k/100k entities:
  - pan/zoom, picking, tool draw
  - assert budgets: `apply_commands` < X ms, rebuild < Y ms

---

## 6) Riscos (os que realmente explodem o cronograma)

1) Texto (shaping/fonte): decidir cedo se HarfBuzz entra ou não.
2) Símbolos SVG: fidelidade vs performance; atlas reduz fidelidade de zoom extremo.
3) Undo/redo: sem command log no engine vira “quase legacy” de novo.
4) Import DXF/PDF: hoje gera shapes TS; terá que gerar comandos engine.

---

## 7) Próxima autorização necessária (para eu executar)

Para começar a execução sem “meia migração”, eu recomendo autorizar **em fatias**:

1) Autorizar Fase 0–1 (EngineRuntime + document mutável + command buffer + render buffers).
2) Autorizar Fase 2 (tools no engine; remoção Canvas2D do runtime).
3) Autorizar Fase 3–6 (text/symbols/elétrico/persistência).
4) Autorizar Fase 7 (delete físico do legacy).

