# PR10 — Hardening (benchmarks + guardrails)

## Problem
- O roadmap do renderer vetorial precisa de **guardrails determinísticos** (picking/tri-count/perf budget) e **benchmarks reproduzíveis** para prevenir regressões de fidelidade/performance durante a migração incremental (legacy → WebGL2/WebGPU + IR v1 + tesselação).

## Plan
- Adicionar testes determinísticos com foco em:
  - `picking` (invariantes já existentes) e regressões do pipeline,
  - `tri-count` / batching (invariantes já existentes),
  - `perf budget` como limites estruturais/complexidade (sem timing frágil).
- Adicionar scripts de benchmark determinísticos em `frontend/verification/` e expor comandos via `pnpm`.
- Registrar o pacote de hardening (arquivos + comandos) em um relatório novo sob `resources/reports/`.

## What I will change
- Adicionar guardrails unitários determinísticos e scripts de benchmark TS-side.
- Documentar como rodar testes e benchmarks.

## What I will not change
- Não alterar comportamento do produto por padrão (feature flags/render mode permanecem iguais).
- Não introduzir dependências externas novas.

## Files changed
- `frontend/tests/perfBudgets.test.ts`
- `frontend/verification/benchmark_vector_index.mjs`
- `frontend/verification/benchmark_svg_to_vector_document.mjs`
- `frontend/verification/README.md`
- `frontend/package.json`

## Risk
- Low: mudanças são isoladas a testes/scripts e documentação.
- Mitigação: testes são determinísticos (sem wall-clock assertions) e scripts são opt-in.

## Verification
Executed:
- `cd frontend && pnpm test` (PASS)

Optional (benchmarks):
- `cd frontend && pnpm bench:world-snapshot`
- `cd frontend && pnpm bench:vector-index`
- `cd frontend && pnpm bench:svg-to-ir`

