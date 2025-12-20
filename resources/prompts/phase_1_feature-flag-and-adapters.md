# Prompt — Fase 1: Feature Flag + Porta de Arquitetura (Adapters) sem quebrar o editor

**Role:** Atue como **Senior Frontend Engineer** e **Software Architect**.

**Contexto:**

- O editor Canvas2D atual precisa continuar funcionando como default (“Legacy”).
- O novo renderer/engine (R3F + WASM) deve entrar **isolado**, com rollback imediato.

**Referências (source of truth):**

- `AGENTS.md`
- `resources/reports/report_7_wasm-migration-backlog.md` (MVP da Fase 1)

## Objetivo

Implementar um **toggle** `legacy|next` (feature flag) e um “host” que escolha o surface do CAD **sem alterar o fluxo principal** do editor:

- `Legacy`: permanece default e deve rodar igual.
- `Next`: fica em rota dev-only ou toggle escondido.

## Regras (não negociáveis)

- Sem big bang: não remover nem reescrever o Canvas2D nesta fase.
- Falha ao inicializar Next deve **voltar automaticamente** para Legacy (guard).
- Sem mudanças em UX do usuário final (dev-only ok).

## Tarefas

1. **Feature flag**

- Definir `engineBackend` com fontes (ordem):
  1. query param `?engine=next|legacy`
  2. `localStorage`
  3. default `legacy`

2. **Host components**

- Criar uma composição explícita:
  - `CadSurfaceLegacy` (wrapping do editor/canvas atual)
  - `CadSurfaceNext` (viewer isolado)
  - `CadSurfaceHost` decide qual renderizar

3. **Rota dev-only (recomendado)**

- Criar uma rota/tela que renderiza `CadSurfaceNext` sem impactar a tela principal.

4. **Fallback automático**

- Se `CadSurfaceNext` falhar ao carregar WASM, logar o erro e forçar `engineBackend=legacy`.

5. **Telemetria mínima (dev)**

- Exibir na UI (dev-only) o backend ativo: “Engine: legacy/next”.

## Critérios de sucesso (Gates)

- Com `engine=legacy` (default) o app funciona como antes.
- `engine=next` abre o viewer isolado e não impacta o editor principal.
- Se o WASM falhar, o app não fica branco: volta para legacy.

## Output esperado

- Arquivos alterados e o caminho exato para acessar o viewer Next.
- Instruções rápidas: como alternar `legacy/next` via URL.
