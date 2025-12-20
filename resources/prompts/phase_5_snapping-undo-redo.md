# Prompt — Fase 5: Snapping + Undo/Redo (determinismo e performance)

**Role:** Atue como **Engine Systems Programmer** e **CAD Tooling Engineer**.

**Contexto:**
- O viewer Next já renderiza e possui interação base.
- Agora é a fase de maior risco: snapping e undo/redo precisam ser determinísticos e rápidos.

**Referências (source of truth):**
- `AGENTS.md`
- `frontend/features/editor/snapEngine/*`
- `frontend/stores/useDataStore.ts` (history/past/future)
- `resources/reports/report_7_wasm-migration-backlog.md`

## Objetivo

Implementar snapping e undo/redo no Next de forma incremental (por tool), mantendo:
- determinismo (mesmo input -> mesmo output),
- zero allocations nos hot paths,
- compatibilidade com o modelo legacy até o “flip” final.

## Estratégia recomendada

1) **Snapping por camadas (incremental)**
- Grid snap primeiro.
- Endpoints/midpoints de `line/polyline` depois.
- Connection points e regras elétricas por último.

2) **Undo/Redo com compatibilidade**
Escolher um caminho:
- (A) manter o log de patches no TS e replicar no WASM (ponte), ou
- (B) começar log de comandos no WASM e exportar eventos para TS.

Nesta fase, preferir (A) para reduzir impacto, com plano claro para migrar ao (B).

## Tarefas

1) **Spatial index no WASM (broadphase)**
- Grid hash/BVH 2D para queries rápidas.

2) **Snapping APIs batch**
- `snap(queryPoints[], options) -> snappedPoints[]`
- Evitar chamadas por mousemove individuais (batch por frame).

3) **Undo/Redo determinístico**
- Definir invariantes e testes:
  - aplicar N comandos, desfazer N, refazer N -> estado idêntico.

4) **Fixtures e testes**
- Criar fixtures pequenas em `frontend/verification/` quando necessário.
- Testes determinísticos (sem clock/random).

## Critérios de sucesso (Gates)

- Snapping no Next igual (ou melhor) ao legacy para tools suportadas.
- Undo/redo determinístico com testes.
- Sem regressão no legacy.

## Output esperado

- Lista de snapping features portadas.
- Plano claro: como o undo/redo será migrado para o WASM como source of truth (próxima fase).

