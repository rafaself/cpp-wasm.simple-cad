# Report 14 — Fase 5: snapping no engine + remoção de campos legacy de eletrodutos

**Data:** 2025-12-19  
**Base:** `resources/reports/report_9_next-only-execution-plan.md` (Fase 5)  
**Status:** execução concluída (snapping + remoção de aliases legacy de endpoints)

---

## 1) Problema

O editor já estava renderizando em R3F/WebGL e o motor WASM já possuía modelo elétrico (símbolos/nós/eletrodutos), porém:

- O **snapping de elétrica** ainda dependia de lógica em TS (broadphase no store), em vez de consultar o engine.
- Existiam **campos legacy** de endpoints de eletroduto no schema de `Shape` (`fromConnectionId/toConnectionId/connected*`) e caminhos de export/normalização que ainda os utilizavam.

Isso impedia o “gate” da Fase 5 do plano (`report_9`): **operar elétrica sem aliases legacy** e com snapping suportado no engine.

---

## 2) Abordagem aplicada

### 2.1 Snapping elétrico no WASM (engine)

- Implementado `CadEngine.snapElectrical(x, y, tolerance)` no C++:
  - retorna `SnapResult { kind: 0 none | 1 node | 2 symbol-connection, id, x, y }`
  - prioriza `node` (topologia explícita) sobre `symbol-connection` (connectionPoint direto do símbolo)
- Exposto via Embind e consumido no frontend.
- Ajustado `resolveNodePosition(...)` para **sempre** ter fallback estável (usa `node.x/y` se o símbolo ancorado não existir), evitando “sumir” eletroduto em casos de deleção/desync.

### 2.2 UI usando snapping do engine

- `EngineInteractionLayer.tryFindAnchoredNode(...)` consulta o engine via `snapElectrical` e:
  - `kind=1`: resolve `nodeId` (u32→string via `EngineRuntime.getIdMaps().idHashToString`)
  - `kind=2`: resolve `symbolId` (u32→string) e cria/usa nó ancorado via `useDataStore.getOrCreateAnchoredConnectionNode(...)`
- Mantido fallback TS se runtime ainda não carregou ou se ocorrer exceção (para evitar hard-fail durante load).

### 2.3 Remoção de aliases legacy de endpoints

- Removidos os campos legacy do schema `Shape`:
  - `fromConnectionId`, `toConnectionId`, `connectedStartId`, `connectedEndId`
- Removidos usos desses campos em:
  - criação de eletrodutos (`addConduitBetweenNodes`)
  - normalização (`normalizeConnectionTopology`)
  - export/relatório de conexões (`EditorRibbon`)
- Ajustados testes para refletir o modelo “node-first”.

---

## 3) Arquivos alterados

**Engine (C++/WASM)**
- `cpp/engine.cpp`

**Frontend (React/TS)**
- `frontend/src/components/EngineInteractionLayer.tsx`
- `frontend/types/index.ts`
- `frontend/stores/useDataStore.ts`
- `frontend/utils/connections.ts`
- `frontend/features/editor/components/EditorRibbon.tsx`
- `frontend/tests/connections.test.ts`

**Gerados (build outputs)**
- `frontend/public/wasm/engine.js`
- `frontend/public/wasm/engine.wasm`

---

## 4) Riscos / observações

- `snapElectrical` faz varredura linear de `nodes` e `symbols`; para documentos grandes, o próximo passo é adicionar **broadphase/spatial index no engine** (ainda dentro da Fase 5 do plano).
- A remoção dos campos legacy pode quebrar **arquivos antigos** que dependiam desses campos; isso está alinhado com sua decisão (“sem compat/sem legado”).
- Texto ainda usa atlas SDF gerado em runtime (qualidade/determinismo cross-machine via MSDF + fontes embutidas continua como pendência do plano).

---

## 5) Verificação executada

- Build frontend: `cd frontend && npm run build`
- Testes: `cd frontend && npx vitest run`
  - Observação: falha existente em `frontend/tests/undoRedo.spec.ts` (já era conhecida e não relacionada a esta fase).
- Build WASM: `cd frontend && npm run build:wasm`

---

## 6) Como iniciar (passo a passo)

### Opção A — dev local

1) WASM (sempre que alterar `cpp/engine.cpp`):
   - `cd frontend && npm run build:wasm`
2) Frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev`
   - abrir `http://localhost:3000`

### Opção B — via Docker (stack completo)

- `docker compose up`
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
