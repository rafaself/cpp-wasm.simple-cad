# 🚀 Prompt de Execução — Nova Ferramenta de Texto (Engine-First, MSDF)

## Contexto

Este projeto visa implementar a nova ferramenta de texto do **EndeavourCanvas**, conforme a arquitetura definida no relatório:

**“Relatório de Investigação: Nova Ferramenta de Texto (Engine-Native)”**.

A ferramenta de texto atual (baseada em DOM/Canvas2D) está quebrada e deve ser **totalmente removida e substituída** por esta nova implementação.

Verifique o arquivo '/resources/text_implementation.md' para mais detalhes

---

## Objetivo

Implementar a nova ferramenta de texto com:

- Arquitetura **engine-first** no C++/WASM.
- Layout, shaping e métricas no engine (FreeType + HarfBuzz).
- Renderização por **glyph atlas com MSDF**.
- UX de criação/edição estilo Figma, porém com **conjunto básico de ferramentas**.
- Nitidez perfeita sob **zoom, rotação e mudança de escala** (CAD/pranchas, ex.: 1:100).
- Código com **SRP, modularidade e baixo acoplamento**, permitindo fácil evolução.

---

## Diretrizes Arquiteturais (Obrigatórias)

- O **Engine C++/WASM é a fonte da verdade** para:

  - conteúdo do texto,
  - runs,
  - layout,
  - geometria,
  - bounds.

- JS:

  - orquestra UI/ferramentas,
  - mantém um **TextInputProxy** (`contenteditable`) **apenas** para input/IME/clipboard,
  - não realiza layout nem render.

- Render:

  - via **TextRenderPass** dedicado,
  - usando quads instanciados + shader **MSDF**,
  - com suporte a `drawOrder` (z-index).

- **Canvas2D não deve ser usado** para render final do texto.
- MSDF deve ser **gerado no engine** (via msdfgen).
- Arquitetura deve seguir **SRP** e ser modular:

  - `TextLayoutEngine`
  - `GlyphAtlas`
  - `TextStore`
  - `TextRenderPass`
  - `TextInputProxy`

- Código legado da ferramenta antiga de texto deve ser removido.

---

## Modelo Base (conforme Relatório)

Use como referência as estruturas:

```cpp
struct TextRun {
    uint32_t startIndex;
    uint32_t length;
    uint32_t fontId;
    float fontSize;
    uint32_t colorRGBA;
    uint8_t flags; // Bold, Italic, Underline, Strike
};

struct TextRec {
    uint32_t id;
    uint32_t drawOrder;

    float x, y;
    float rotation;

    uint8_t boxMode; // 0=AutoWidth, 1=FixedWidth
    float constraintWidth;

    float layoutWidth;
    float layoutHeight;
    float minX, minY, maxX, maxY;

    uint32_t contentOffset;
    uint32_t contentLength;
    uint32_t runsOffset;
    uint32_t runsCount;

    uint8_t align; // Left, Center, Right
};
```

Mesmo que inicialmente a UI crie apenas 1 run, o engine deve sempre operar sobre listas de runs.

---

## Comportamentos Obrigatórios

- **AutoWidth**:

  - sem quebra automática (apenas `\n`),
  - `layoutWidth` = largura da maior linha.
  - Após criado, ao redimensionar, pode passar para FixedWidth.

- **FixedWidth**:

  - quebra automática em `constraintWidth`,
  - overflow vertical permitido,
  - caixa não cresce verticalmente.

- **Resize da caixa**:

  - altera apenas `constraintWidth`,
  - **não escala fonte nem estilos**.

- Escala do texto só ocorre via **ferramenta explícita de escala/transform**, não pelo resize da caixa.
- Underline/Strike:

  - desenhados como **geometria derivada das métricas do FreeType** (com fallback).

- Texto deve respeitar `drawOrder` para futura intercalação com shapes.

---

## Performance

- Digitação sem lag perceptível (~60fps).
- Layout e buffers recalculados **apenas quando conteúdo/runs/box mudarem**.
- Atlas incremental por glifo (cache).
- Nada de re-render global desnecessário.

---

## Fases de Execução e Checkpoints

### 🧱 Fase 1 — Infraestrutura Core (C++)

**Objetivo:** preparar o engine para tipografia nativa.

**Tarefas:**

- Integrar FreeType, HarfBuzz e msdfgen no CMake (WASM).
- Otimizar build:

  - `-Os`,
  - desabilitar módulos não usados do FreeType,
  - evitar embutir fontes no binário.

- Criar módulo `cpp/engine/text/` com:

  - `TextStore`,
  - `TextLayoutEngine` (com suporte a runs),
  - `GlyphAtlas` (engine-owned).

**Checkpoint:**

- WASM compila com as libs.
- Teste simples em C++:

  - carregar fonte,
  - gerar MSDF de um glifo,
  - calcular métricas de uma string.

---

### 🖊️ Fase 2 — Integração Básica & Input (JS ↔ Engine)

**Objetivo:** permitir criar/editar texto sem ainda renderizar.

**Tarefas:**

- Implementar comandos no engine:

  - `CreateText`, `UpsertText`, `DeleteText`.

- Criar `TextInputProxy.tsx`:

  - contenteditable invisível,
  - SRP: input/IME/clipboard/seleção nativa.

- Bridge:

  - enviar deltas de texto/runs para engine,
  - receber posição de cursor (`getCaretPos`).

- Implementar hit-testing básico no engine:

  - world → charIndex.

**Checkpoint:**

- É possível:

  - criar texto,
  - digitar,
  - mover cursor,
  - confirmar edição,
    sem ainda ver render gráfico do texto.

---

### 🎨 Fase 3 — Renderização MSDF

**Objetivo:** desenhar texto nítido na cena.

**Tarefas:**

- Implementar `GlyphAtlas`:

  - páginas dinâmicas ou crescimento,
  - cache de glifos,
  - política simples de overflow.

- Implementar `TextRenderPass`:

  - quads instanciados,
  - shader MSDF,
  - consumo dos buffers do engine.

- Integrar no `Webgl2TessellatedRenderer`.
- Garantir que texto respeita `drawOrder`.

**Checkpoint:**

- Texto aparece na cena:

  - nítido em zoom/rotação/escala,
  - sem blur,
  - com múltiplos tamanhos.

- Novos glifos entram no atlas sob demanda.

---

### ✍️ Fase 4 — UX de Edição e Rich Text Básico

**Objetivo:** tornar a ferramenta utilizável.

**Tarefas:**

- Modos de criação:

  - clique → AutoWidth,
  - arraste → FixedWidth.

- Resize da caixa:

  - atualiza apenas `constraintWidth`.

- Implementar seleção visual:

  - engine retorna bounds por char/range.

- Aplicar estilos por run:

  - bold, italic, underline, strike,
  - cor, fonte, tamanho.

- Ribbon:

  - quando editor ativo → aplica à seleção,
  - quando não → aplica ao shape.

**Checkpoint:**

- Usuário consegue:

  - criar texto,
  - selecionar trechos,
  - aplicar estilos,
  - mover e redimensionar caixa,
  - sem perda de nitidez ou dessync.

---

### 📐 Fase 5 — DXF

**Objetivo:** compatibilizar importação.

**Tarefas:**

- Atualizar `dxfToShapes.ts`:

  - TEXT/MTEXT → TextRec + Runs.
  - mapear altura → fontSize,
  - alinhamento, rotação,
  - layer → drawOrder/layer,
  - códigos de formatação → runs.

- Fallback seguro para fontes disponíveis.

**Checkpoint:**

- Importar DXF com textos visíveis e posicionados corretamente.

---

### 🧹 Fase 6 — Limpeza

**Objetivo:** remover legado.

**Tarefas:**

- Remover:

  - `TextSdfLayer.tsx`,
  - `TextEditorOverlay.tsx` antigo,
  - `fontAtlas.ts` JS,
  - lógica antiga de texto no store.

- Garantir que nenhuma funcionalidade fora de texto foi afetada.

**Checkpoint:**

- Build limpo.
- Nova ferramenta de texto funcionando sozinha.

---

## Entregáveis Esperados

Ao final, entregar:

1. **Resumo das decisões implementadas.**
2. **Lista de arquivos criados/alterados/removidos.**
3. **Instruções de build (WASM) e flags usadas.**
4. **Casos de teste manuais:**

   - criação,
   - zoom/rotação/escala,
   - rich text,
   - resize,
   - DXF.

5. **Avaliação de risco remanescente.**

---

## Restrições

- ❌ Não usar Canvas2D para render final.
- ❌ Não reintroduzir lógica DOM para layout/render.
- ❌ Não quebrar outras ferramentas.
- ✅ Focar exclusivamente na ferramenta de texto.
- ✅ Seguir rigorosamente a arquitetura do Relatório.

---
