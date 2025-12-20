# Prompt — Fase 4: Interação base (pan/zoom/pick/selection) com paridade de UX

**Role:** Atue como **Frontend Interaction Engineer** e **Engine Developer**.

**Contexto:**
- O viewer Next já renderiza shapes reais (subset) em modo read-only.
- Agora precisamos adicionar interação mínima sem reescrever todas as ferramentas.

**Referências (source of truth):**
- `AGENTS.md`
- `frontend/features/editor/interaction/useCanvasInteraction.ts` (comportamento legacy)
- `resources/reports/report_7_wasm-migration-backlog.md`

## Objetivo

Adicionar no Next:
- pan/zoom com coordenadas compatíveis,
- picking por click (retorna entityId/shapeId),
- highlight/selection (visual),
mantendo o editor legacy intacto e com fallback.

## Tarefas

1) **Camera parity**
- Implementar transform de mundo e zoom no R3F compatível com o modelo atual (Y-up, escala).
- Garantir que o viewport no Next pode ser convertido para “world rect” para culling/picking.

2) **Picking**
- Implementar picking mínimo para `rect/line`:
  - broadphase (AABB) em WASM (preferível) ou JS temporário
  - retornar id do hit mais próximo

3) **Selection state**
- Reusar seleção no `useUIStore` (ou criar espelho) sem quebrar legacy.
- Renderizar highlight no Next.

4) **Guards**
- Se picking falhar ou Next não tiver suporte ao shape, não crashar; apenas não selecionar.

## Critérios de sucesso (Gates)

- Pan/zoom fluido e consistente com o legacy (sensação e escala).
- Click seleciona um shape suportado e mostra highlight.
- Sem regressão no legacy.

## Output esperado

- Lista de interações suportadas no Next.
- Lista de limitações e próximos tipos a portar para picking.

