# Prompt — Fase 6: Flip do Source of Truth (TS → WASM) + Snapshot versionado

**Role:** Atue como **Principal Engineer** (Architecture + Systems).

**Contexto:**
- O Next já tem paridade suficiente (render + interação + snapping/undo subset).
- Agora o WASM vira dono do documento; TS vira view-model (UI-only).

**Referências (source of truth):**
- `AGENTS.md`
- `resources/reports/report_5_cad-wasm-tech-spec.md`
- `resources/reports/report_4_data-structure-audit.md`
- `resources/reports/report_7_wasm-migration-backlog.md`

## Objetivo

Realizar a transição controlada em que:
- o documento vive no WASM,
- TS stores carregam apenas estado de UI/seleção/filtros,
- existe serialização versionada (JSON/binário) com migrators,
- a performance 100k+ é medida e mantida.

## Pré-condições (obrigatórias)

- Test suite de regressão mínima (fixtures) para:
  - import/export
  - snapping/undo determinístico
- Instrumentação (counters + timings).
- Estratégia de memória estável (evitar invalidar views):
  - preferível: capacity planning e `ALLOW_MEMORY_GROWTH=0` em produção.

## Tarefas

1) **World snapshot versionado**
- Definir schema `vN` e migrators.
- Garantir compatibilidade com projetos antigos (import legacy).

2) **Reescrever o fluxo de persistência**
- carregar snapshot no WASM
- exportar snapshot do WASM
- TS apenas aciona comandos (batch) e lê views/buffers.

3) **Stores TS como view-model**
- manter: seleção, ferramenta ativa, viewport/câmera, preferências de UI.
- remover do TS: shapes como fonte de verdade (somente cache/ids).

4) **Hardening de performance**
- benchmarks 10k/100k
- profiling do bridge e uploads GPU
- budget por frame

## Critérios de sucesso (Gates)

- Next vira default sem regressões críticas.
- Legacy continua disponível como fallback por uma janela (opcional).
- Import/export estável e versionado.
- 100k+ entidades com 60 FPS (com números e cenário reproduzível).

## Output esperado

- Documento “migration notes” (como migrar projetos e como depurar).
- Métricas (antes/depois) com metodologia.

