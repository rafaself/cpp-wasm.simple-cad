# Phase 5 (Start) — Electrical graph in WASM (symbols/nodes/conduits)

## Problema

O projeto ainda estava com a “lógica elétrica” (nós/âncoras/endpoints de eletroduto) fora do WASM:

- `connectionNodes` e `normalizeConnectionTopology` vivem no TS.
- Conduits eram renderizados no WASM **apenas como polyline/line vindo dos pontos do TS**, o que mantém o core elétrico fora da nova arquitetura.

Isso impede a evolução para:

- snapping/picking elétrico determinístico no engine
- regras de ancoragem/propagação de endpoints “no core”
- melhor performance em docs grandes (eliminando recomputações no TS)

## Objetivo desta etapa

Dar o primeiro passo real da Fase 5: **o WASM passa a ter um modelo elétrico** e passa a gerar a geometria de conduits a partir de:

- símbolos (bounds + connection point)
- nós (free/anchored)
- conduits (fromNodeId/toNodeId)

O TS ainda mantém o documento para UI/persistência (por enquanto), mas o engine passa a ser capaz de:

- resolver posição de nó ancorado via `connectionPoint` + transform do símbolo
- renderizar conduits sem depender de `points[]` do TS

## Mudanças implementadas

### 1) WASM: novas entidades e comandos

Arquivo: `cpp/engine.cpp`

- Novas entidades no engine:
  - `SymbolRec` (id, symbolKey, x/y/w/h, rotation, scaleX/scaleY, connX/connY)
  - `NodeRec` (id, kind, anchorSymbolId, x/y)
  - `ConduitRec` (id, fromNodeId, toNodeId)
- Novos `CommandOp`:
  - `UpsertSymbol = 6`
  - `UpsertNode = 7`
  - `UpsertConduit = 8`
- Resolução de nó ancorado no engine:
  - usa `connX/connY` no retângulo do símbolo
  - aplica flip (`scaleX/scaleY`) e `rotation` em torno do centro
- Render:
  - `rebuildRenderBuffers()` agora adiciona segmentos de `conduits` em `lineVertices` (sem depender de polylines TS)
- Stats:
  - adicionados `symbolCount`, `nodeCount`, `conduitCount` em `EngineStats` (expostos via Embind)

### 2) TS: command buffer atualizado

Arquivo: `frontend/engine/runtime/commandBuffer.ts`

- Inclusão das estruturas e encoding binário para:
  - `UpsertSymbol` (40 bytes)
  - `UpsertNode` (16 bytes)
  - `UpsertConduit` (8 bytes)

### 3) TS: store → WASM sync com nós/conduits/símbolos

Arquivo: `frontend/engine/runtime/useEngineStoreSync.ts`

- Passa a espelhar:
  - `connectionNodes` → `UpsertNode` (anchored envia `anchorSymbolId`, free envia `x/y`)
  - símbolos (shapes `rect` com `svgSymbolId`+`connectionPoint`) → `UpsertSymbol`
  - conduits (`eletroduto/conduit`) → `UpsertConduit` usando `fromNodeId/toNodeId`
- Importante: conduits **não são mais espelhados como polyline** (evita duplicação e força o engine a resolver endpoints).

### 4) Tipos TS: engine stats

- `frontend/engine/runtime/EngineRuntime.ts`
- `frontend/src/components/CadViewer.tsx`

Adicionados campos opcionais para os novos contadores no retorno de `getStats()`.

## Arquivos alterados

- `cpp/engine.cpp`
- `frontend/engine/runtime/commandBuffer.ts`
- `frontend/engine/runtime/useEngineStoreSync.ts`
- `frontend/engine/runtime/EngineRuntime.ts`
- `frontend/src/components/CadViewer.tsx`
- `frontend/public/wasm/engine.js` (gerado)
- `frontend/public/wasm/engine.wasm` (gerado)

## Riscos / notas

- Ainda há duplicação temporária: TS mantém `connectionNodes` e também envia para o WASM.
- Ainda não removemos `normalizeConnectionTopology` do TS; isso vem quando a UI passar a consumir as queries do engine (ou quando tools forem movidas).
- Snapshot binário (`EWC1`) ainda não inclui símbolos/nós/conduits; esta etapa foca em **render via buffers**.

## Verificação

1) Rebuild WASM:
- `cd frontend && npm run build:wasm`

2) Rodar app:
- `cd frontend && npm run dev`

3) Checklist manual:
- Inserir um símbolo elétrico (Tomada/Lâmpada).
- Criar um `Eletroduto` ancorando em 2 símbolos.
- Mover o símbolo e confirmar que o conduit continua “ligado” (agora o engine consegue resolver endpoints por nó ancorado).
- `EngineStats` deve mostrar contadores `symbolCount/nodeCount/conduitCount` (se o overlay de debug estiver ligado).

## Próximos passos (continuação da Fase 5)

1) Mover snapping/picking elétrico para o engine:
   - `engine_pick(...)` / `engine_snap_connection(...)`
2) Remover campos/aliases legados de conduits (`connectedStartId/connectedEndId`, `fromConnectionId/toConnectionId`) e usar somente nodes.
3) Parar de manter `connectionNodes` no TS como “autoridade” (derivar do engine).

