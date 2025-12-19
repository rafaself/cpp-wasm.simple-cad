# Report 16 — Fix: undo/redo quebrado (patch direction)

**Data:** 2025-12-19  
**Status:** corrigido (testes passando)

---

## Problema

O fluxo de `undo()` estava populando `future` com patches **invertidos** (ex.: undo de `ADD` gerava patch `DELETE`), o que fazia com que `redo()` não reaplicasse a ação original.

Sintoma observado:
- falha em `frontend/tests/undoRedo.spec.ts` ao fazer `redo()` do `ADD` após `undo()` do `ADD`.

---

## Correção aplicada

- `useDataStore.undo()` agora empurra para `future` o **patch forward original** (o mesmo patch que estava em `past`), em vez do patch invertido.
- Isso restaura a semântica esperada:
  - `past` armazena ações forward (`ADD/UPDATE/DELETE`)
  - `undo()` reverte o estado e move o mesmo patch para `future`
  - `redo()` reaplica o patch forward vindo de `future`

Arquivo:
- `frontend/stores/useDataStore.ts`

---

## Risco

- Baixo: ajuste restrito à direção dos patches de `undo()`; não altera a representação do documento nem a UI.
- Impacto esperado: `redo()` passa a funcionar corretamente para `ADD`/`DELETE` (além de `UPDATE`).

---

## Verificação

- `cd frontend && npx vitest run`
  - `frontend/tests/undoRedo.spec.ts` passou
  - suite completa: `19 passed`

