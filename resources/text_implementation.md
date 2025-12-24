# Relatório de Investigação: Nova Ferramenta de Texto (Engine-Native) - v2

## 1. Visão Geral

Este documento define a arquitetura para a nova ferramenta de texto do EndeavourCanvas, adotando uma abordagem **"Engine-First"** (estilo Figma). A responsabilidade de layout, shaping e renderização será exclusiva do **Engine C++/WASM**, utilizando **FreeType**, **HarfBuzz** e **MSDF**.

A implementação atual (DOM/Canvas2D) será removida e substituída por este pipeline nativo, garantindo fidelidade visual absoluta em qualquer escala.

## 2. Arquitetura

### 2.1. Componentes

- **Frontend (JS/React)**:

  - **TextTool**: Gerenciador de estado da ferramenta.
  - **TextInputProxy**: Componente invisível (ou `contenteditable` transparente) com **Responsabilidade Única (SRP)** de capturar entrada de teclado, IME (acentuação) e manuseio de Clipboard/Seleção nativa. **Não realiza layout nem renderização.**
  - **Bridge**: Envia deltas de input para o Engine e recebe coordenadas de cursor para posicionar o "caret" visual.

- **Engine (C++/WASM)**:

  - **TextLayoutEngine**: Núcleo tipográfico.
    - Usa **HarfBuzz** para shaping (ligaduras, kerning, bidi).
    - Usa **FreeType** para extração de métricas e outlines.
    - Calcula quebra de linhas e bounds finais.
  - **GlyphAtlas**: Módulo C++ responsável por gerar (via **msdfgen**) e gerenciar texturas de glifos. O JS não toca na geração do atlas.
  - **TextStore**: Armazena o modelo de dados (TextEntities e Runs).

- **Renderer (WebGL2/WebGPU)**:
  - **TextRenderPass**: Pipeline dedicado para desenhar quads instanciados com shader MSDF.
  - **Composição**: Suporta intercalação com geometria vetorial via `drawOrder` (Z-index).

### 2.2. Fluxo de Dados

1.  **Input**: Usuário digita no `TextInputProxy`.
2.  **Sync**: JS envia comando para o Engine.
3.  **Processamento (C++)**:
    - Engine atualiza modelo (`TextRec` + `Runs`).
    - `TextLayoutEngine` refaz o shaping e wrapping.
    - Se novos glifos forem necessários, `GlyphAtlas` gera MSDF e atualiza textura.
    - Engine atualiza buffers de geometria.
4.  **Render**: Renderer desenha o frame.
5.  **Feedback**: Engine retorna posição do cursor para o JS ajustar a UI.

## 3. Modelo de Dados (C++)

O modelo suportará "Rich Text" (múltiplos runs) desde o dia zero.

### 3.1. Estruturas (`cpp/engine/types.h`)

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
    uint32_t drawOrder; // Z-Index para intercalação com shapes

    // Posição e Restrições (Input do Usuário)
    float x, y;
    float rotation;

    // 0 = AutoWidth (cresce com o texto)
    // 1 = FixedWidth (quebra de linha automática)
    uint8_t boxMode;
    float constraintWidth; // Usado se boxMode=1

    // Resultados do Layout (Output do Engine - Readonly para JS)
    float layoutWidth;
    float layoutHeight;
    // (Opcional) AABB para hit-testing rápido
    float minX, minY, maxX, maxY;

    // Conteúdo (Referências aos buffers globais)
    uint32_t contentOffset;
    uint32_t contentLength;
    uint32_t runsOffset;
    uint32_t runsCount;

    uint8_t align; // 0=Left, 1=Center, 2=Right
};
```

_Nota: Mesmo que a UI inicial crie apenas 1 Run por texto, o Engine tratará sempre como uma lista de Runs._

## 4. Comportamento de Layout

1.  **AutoWidth (`boxMode=0`)**:
    - O texto não quebra linha automaticamente (apenas com `\n` explícito).
    - `layoutWidth` será a largura da linha mais longa calculada.
    - `constraintWidth` é ignorado.
2.  **FixedWidth (`boxMode=1`)**:
    - O texto quebra linha ao atingir `constraintWidth`.
    - `layoutWidth` será o próprio `constraintWidth` (ou menor, dependendo do alinhamento/implementação).
    - `layoutHeight` cresce verticalmente conforme necessário.
3.  **Resize**:
    - Redimensionar a caixa pelo usuário altera apenas `constraintWidth` (se Fixed) ou escala (se transform). Não altera o tamanho da fonte (exceto se ferramenta de escala explícita for usada).

## 5. Estratégia de Renderização e Build

- **MSDF Engine-Owned**: A geração de bitmaps distorcidos (MSDF) ocorre exclusivamente no WASM.
- **Otimização de Binário**:
  - Compilação com `-Os` (size optimization).
  - Build modular do FreeType (desabilitar drivers legados/não usados).
  - Carregamento de fontes sob demanda (evitar embutir TTFs no binário).

## 6. Plano de Execução (Fases)

1.  **Infraestrutura Core (C++)**:
    - Configurar CMake com FreeType, HarfBuzz e msdfgen (otimizados).
    - Implementar `TextLayoutEngine` com suporte inicial a lista de Runs.
2.  **Integração Básica**:
    - Criar comandos `UpsertText` no Engine.
    - Implementar `TextInputProxy` no JS (sem render).
3.  **Renderização**:
    - Implementar `GlyphAtlas` e `TextRenderPass` (WebGL2).
    - Conectar buffers do Engine ao Renderer.
4.  **Refinamento**:
    - Implementar lógica de Cursor e Seleção (Hit-testing no Engine).
    - Suporte a DXF (Importador mapeando para Runs).

## 7. Impacto e Limpeza

- **Remover**: `TextSdfLayer.tsx`, `TextEditorOverlay.tsx` (antigo), `fontAtlas.ts` (JS).
- **Criar**: `cpp/engine/text/` (Core), `TextInputProxy.tsx` (Nova UI).
