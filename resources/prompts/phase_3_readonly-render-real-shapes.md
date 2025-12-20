# Prompt — Fase 3: Render “read-only” do documento real (subset de shapes)

**Role:** Atue como **Graphics Engineer** e **Frontend Engineer**.

**Contexto:**
- O viewer Next já renderiza geometria de teste via WASM (Fase 2).
- Agora precisamos renderizar o **documento real**, mas ainda **sem interação**.

**Referências (source of truth):**
- `AGENTS.md`
- `frontend/types/index.ts` (Shape atual)
- `resources/reports/report_4_data-structure-audit.md`
- `resources/reports/report_7_wasm-migration-backlog.md`

## Objetivo

Renderizar o conteúdo do store atual (Zustand) no viewer Next (R3F/WASM) em modo read-only, portando tipos por prioridade, mantendo o editor legacy intocado.

## Estratégia recomendada

- TS continua source of truth.
- TS envia um batch para o WASM (snapshot parcial ou patches) para gerar buffers de render.
- O viewer Next desenha apenas os tipos portados; o restante fica:
  - oculto no Next (com aviso dev-only), ou
  - fallback per-shape para Canvas2D (opcional, mais complexo).

## Tarefas

1) **Definir “RenderExtract input”**
- Formato mínimo (por shape):
  - id (string ou hash), type, points/x/y/w/h, rotation, style básico
- Evitar strings grandes (SVG raw) nesta fase.

2) **Portar tipos em ordem**
Ordem sugerida:
1. `rect`
2. `line`
3. `polyline`
Depois: `circle`, `arc`, `text`, `svg symbols`

3) **Culling básico**
- Usar viewport no TS ou no WASM para reduzir trabalho.

4) **Debug UX (dev-only)**
- Mostrar contagem de shapes no store vs quantos foram portados/renderizados no Next.

## Critérios de sucesso (Gates)

- Abrir viewer Next e ver shapes reais (subset) de um projeto simples.
- Nenhuma regressão no editor legacy.
- Benchmark mínimo: 10k shapes estáticos renderizando com pan/zoom suave.

## Output esperado

- Lista de tipos suportados no Next nesta fase.
- Lista de gaps “intencionais” (ex.: texto/SVG ainda não portados).

