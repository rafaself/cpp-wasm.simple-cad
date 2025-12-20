# Report 15 — Fase 6: persistência “final” (EWND v2 + CRC) + snapshot engine v3

**Data:** 2025-12-19  
**Guideline:** `resources/reports/report_9_next-only-execution-plan.md` (Fase 6)  
**Status:** execução aplicada (formato binário com checksums + snapshot engine ampliado)

---

## 1) Problema

A persistência “Next” existente (`.ewnd`) ainda era um container muito simples:

- blobs internos eram JSON sem **integridade** (qualquer byte corrompido passava despercebido até falhar em parse)
- não havia espaço formal para embutir snapshot do engine WASM (EWC1) para evoluir o fluxo “abrir snapshot → replay log”
- o snapshot do engine (`EWC1`) ainda não carregava **símbolos/nós/eletrodutos**, o que impedia usá-lo como base real de persistência elétrica

---

## 2) Abordagem / plano executado

1) Evoluir `.ewnd` para um **container binário v2** com tabela de seções e **CRC32 por seção**.
2) Manter os dados de UI (meta + project + history) como seções obrigatórias e adicionar seção opcional `ESNP` (engine snapshot bytes).
3) Subir o snapshot `EWC1` do engine para **v3**, incluindo entidades elétricas (symbols/nodes/conduits) e garantindo re-hidratação de `entities` no load.
4) Ajustar o decoder TS de snapshot para aceitar v3 (evitar regressão no `CadViewer` que decodifica snapshot para snapping/pick).
5) Adicionar testes determinísticos para `.ewnd`.

---

## 3) Mudanças implementadas

### 3.1 `.ewnd` v2: seções + CRC32

- `frontend/persistence/nextDocumentFile.ts`
  - `EWND` **v2**:
    - header + table de seções (`META/PROJ/HIST/ESNP`)
    - CRC32 por seção (falha rápida em corrupção)
  - Mantido decode de `EWND` v1 por enquanto (somente leitura) para não quebrar arquivos já gerados.
  - `EditorRibbon` passou a salvar `ESNP` com o snapshot do engine (cópia estável do HEAP).

### 3.2 Snapshot do engine `EWC1` v3 (com elétrica)

- `cpp/engine.cpp`
  - snapshot `EWC1` agora exporta **v3** com:
    - `symbols`, `nodes`, `conduits` além de `rects/lines/polylines/points`
  - `loadSnapshotFromPtr` agora:
    - aceita v2/v3
    - reconstroi `entities` map ao carregar (antes ficava vazio após load)

### 3.3 Decoder TS de snapshot aceita v3

- `frontend/src/next/worldSnapshot.ts`
  - adicionados tipos/decoder/encoder para `WorldSnapshotV3` (sem quebrar V2)
  - `migrateWorldSnapshotToLatest` passa a migrar para v3

### 3.4 Testes

- `frontend/tests/nextDocumentFile.test.ts`
  - roundtrip do `.ewnd` v2
  - detecção de corrupção (CRC mismatch)

---

## 4) Arquivos alterados

- `frontend/persistence/nextDocumentFile.ts`
- `frontend/features/editor/components/EditorRibbon.tsx`
- `frontend/tests/nextDocumentFile.test.ts`
- `frontend/src/next/worldSnapshot.ts`
- `cpp/engine.cpp`
- `frontend/public/wasm/engine.js` (gerado)
- `frontend/public/wasm/engine.wasm` (gerado)

---

## 5) Riscos / observações

- O `.ewnd` agora é **v2** (com CRC). O decoder ainda lê v1 para evitar perda de arquivos já salvos; podemos remover o decode v1 na Fase 7 (“Delete Legacy”) se você quiser “hard cut”.
- Ainda não migramos o **source-of-truth** para o engine (TS store ainda é canônico). A seção `ESNP` é um passo para habilitar o fluxo “abrir snapshot → replay log” quando o log passar a ser o command-log do engine.
- Teste preexistente continua falhando: `frontend/tests/undoRedo.spec.ts` (não relacionado à persistência).

---

## 6) Verificação executada

- Build frontend: `cd frontend && npm run build`
- Testes: `cd frontend && npx vitest run`
  - 1 falha preexistente em `frontend/tests/undoRedo.spec.ts`
- Build WASM: `cd frontend && npm run build:wasm`

---

## 7) Como iniciar (passo a passo)

1) (Opcional, se mudou C++): `cd frontend && npm run build:wasm`
2) `cd frontend && npm install`
3) `npm run dev` → `http://localhost:3000`
4) File → `Salvar` gera `eletrocad-next.ewnd` (agora com CRC + snapshot do engine)

