# Report 27 — Revisão Geral da Ferramenta de Texto (Engine-Native)

Data: 2025-12-22

## Problem
Revisar de forma geral a ferramenta de texto (pipeline engine-native) e apontar estado atual, inconsistências, riscos e próximos passos recomendados.

## Scope
Somente o subsistema de texto (C++/WASM + bindings + integração no frontend + testes/docs).

Principais entradas analisadas:
- Docs: [docs/TEXT_ARCHITECTURE.md](../../docs/TEXT_ARCHITECTURE.md), [resources/text_implementation.md](../text_implementation.md)
- Frontend: [frontend/features/editor/tools/TextTool.ts](../../frontend/features/editor/tools/TextTool.ts), [frontend/wasm/textBridge.ts](../../frontend/wasm/textBridge.ts), [frontend/components/TextInputProxy.tsx](../../frontend/components/TextInputProxy.tsx), [frontend/components/TextCaretOverlay.tsx](../../frontend/components/TextCaretOverlay.tsx), [frontend/engine/renderers/webgl2/textRenderPass.ts](../../frontend/engine/renderers/webgl2/textRenderPass.ts), [frontend/types/text.ts](../../frontend/types/text.ts)
- Engine (C++): [cpp/engine.cpp](../../cpp/engine.cpp), [cpp/engine/types.h](../../cpp/engine/types.h), [cpp/engine/text/text_layout.cpp](../../cpp/engine/text/text_layout.cpp), [cpp/engine/text/text_store.cpp](../../cpp/engine/text/text_store.cpp), [cpp/engine/text/glyph_atlas.cpp](../../cpp/engine/text/glyph_atlas.cpp), [cpp/engine/text/font_manager.cpp](../../cpp/engine/text/font_manager.cpp)
- Testes (C++): [cpp/tests/text_store_test.cpp](../../cpp/tests/text_store_test.cpp), [cpp/tests/text_layout_test.cpp](../../cpp/tests/text_layout_test.cpp), [cpp/tests/text_commands_test.cpp](../../cpp/tests/text_commands_test.cpp)

## Plan
1. Mapear arquitetura e fluxo (Tool → Bridge → CommandBuffer → Engine).
2. Validar contratos (byte offsets, metas de buffers, formatos de textura).
3. Checar implementação C++ (layout/shaping, atlas, rebuild de quads).
4. Checar frontend (captura IME, caret overlay, render pass WebGL).
5. Rodar testes nativos e registrar falhas.

## Findings

### 1) Arquitetura e fluxo (alto nível)
O desenho “engine-first” está bem estabelecido:
- O frontend captura entrada (incluindo IME) em [frontend/components/TextInputProxy.tsx](../../frontend/components/TextInputProxy.tsx) e envia deltas para o engine via [frontend/wasm/textBridge.ts](../../frontend/wasm/textBridge.ts) usando o command buffer.
- O engine mantém estado em `TextStore`, faz shaping/layout em `TextLayoutEngine` (HarfBuzz + FreeType), gera MSDF no `GlyphAtlas` (msdfgen) e expõe:
  - quad buffer (float32) via `getTextQuadBufferMeta()`
  - atlas via `getAtlasTextureMeta()`

### 2) Contrato “charIndex” vs “byteIndex” está confuso (risco de bugs)
- No engine, praticamente tudo opera em **offsets UTF-8 em bytes** (correto para HarfBuzz e buffers):
  - `TextRun.startIndex/length` são bytes
  - `TextCaretPayload.caretIndex`, `TextSelectionPayload`, `TextInsertPayloadHeader.insertIndex` são bytes
  - `TextHitResult.charIndex` é byte index (apesar do nome)
- No frontend, `TextToolState.caretIndex/selectionStart/selectionEnd` são **índices em code-units de string JS**.
- O `TextTool` converte corretamente de char→byte na maioria do fluxo (via `charIndexToByteIndex` em [frontend/types/text.ts](../../frontend/types/text.ts)).

Problemas concretos detectados:
- `TextBridge.hitTest()` retorna `TextHitResult | null`, mas o `TextTool.handleEditClick` usa sem checar `null`.
- O `TextTool.handleEditClick` trata `hitResult.charIndex` como se fosse “character index”, mas o engine retorna byte index (nomenclatura enganosa). Isso pode quebrar caret/seleção ao editar texto existente.
- `TextTool.handleEditClick` não consegue recuperar o conteúdo do engine (comentários indicam “TODO”), então `content` local fica vazio e o caret/seleção ficam sem base real.

### 3) Shaping/layout: implementação atual é “MVP” (não cumpre claims de bidi/script)
Em [cpp/engine/text/text_layout.cpp](../../cpp/engine/text/text_layout.cpp), o shaping está hardcoded:
- direction: LTR
- script: LATIN
- language: "en"

Isso contradiz o que está descrito em [docs/TEXT_ARCHITECTURE.md](../../docs/TEXT_ARCHITECTURE.md) (“bidi”, “shaping rico”). Hoje é suficiente para texto latino LTR, mas não para:
- RTL (árabe/hebraico)
- scripts não-latinos
- detecção automática de direção/script

### 4) Render: há bugs prováveis de posição de glifos e espaçamento multi-linha
Há inconsistências importantes entre o que o layout produz e o que o render usa:

**4.1 Posição X dos glifos**
- `shapeRun` preenche `xAdvance` e `xOffset`, porém **não armazena o penX cumulativo**.
- `CadEngine::rebuildTextQuadBuffer()` usa `glyph.xOffset` para o X (ver [cpp/engine.cpp](../../cpp/engine.cpp)).

Em HarfBuzz, `x_offset` é um *delta* relativo ao pen atual; sem somar o avanço acumulado, a maioria dos glifos tende a ser desenhada “colapsada” (sobrepostos ou com offsets mínimos). O próprio `TextLayoutEngine` tem helpers para somar `xAdvance` (`getGlyphX` / loops de soma em caret/hittest), mas o render não usa isso.

**4.2 Espaçamento vertical entre linhas**
Em [cpp/engine.cpp](../../cpp/engine.cpp), o acumulador de linha usa:
- antes da linha: `lineY += line.ascent`
- depois: `lineY += line.descent + line.lineHeight - line.ascent`

O incremento correto para avançar do baseline atual para o topo da próxima linha normalmente é `lineHeight - ascent` (ou manter `yTop += lineHeight` e recalcular baseline como `yTop + next.ascent`). O termo extra `+ line.descent` sugere um espaçamento excessivo, empurrando linhas para baixo.

### 5) Atlas/texture: há mismatch grave entre formato C++ (RGBA) e upload WebGL (RGB)
- O engine declara e aloca atlas **RGBA** (4 bytes/pixel): ver [cpp/engine/text/glyph_atlas.h](../../cpp/engine/text/glyph_atlas.h) e `getTextureDataSize()`.
- `CadEngine::getAtlasTextureMeta()` retorna `byteCount = width*height*4`.
- O frontend em [frontend/engine/renderers/webgl2/textRenderPass.ts](../../frontend/engine/renderers/webgl2/textRenderPass.ts) faz `gl.texImage2D` como **RGB8/RGB**.

Isso é um bug funcional: dados RGBA intercalados não podem ser interpretados como RGB “contíguo” sem embaralhar canais (o A vira o R do próximo pixel). Resultado típico: atlas corrompido na GPU, MSDF inválido e texto ilegível.

### 6) Funcionalidade incompleta na camada de ferramenta/editor
A estrutura existe, mas alguns pontos essenciais para “edição real” ainda não estão fechados:
- Não há API no `TextBridge` para obter conteúdo do engine (impede editar entidades existentes com fonte de verdade no engine).
- Não há plumbing para selection rects do engine (o engine tem `getSelectionRects`, mas não está exposto via bindings/bridge).
- Alocação de IDs no `TextTool` (`nextTextId = 1`) pode colidir com IDs de outras entidades; idealmente deveria vir de um allocator global do editor.

### 7) Docs: divergências com implementação
- [docs/TEXT_ARCHITECTURE.md](../../docs/TEXT_ARCHITECTURE.md) descreve atlas como “R8 single-channel”, mas o código usa RGBA.
- O mesmo doc descreve opcodes 0x20…/1 byte; o projeto atual usa `CommandOp` (u32) e version=2 no command buffer.

## Risk
**Alta** para renderização de texto no frontend (formato de atlas + posicionamento de glifos), pois são bugs “hard” que impedem o texto de aparecer corretamente.

**Média** para edição/hit-test (charIndex vs byteIndex + falta de fonte de verdade do conteúdo).

**Baixa** para armazenamento/command parsing: `TextStore` e parsing estão bem cobertos por testes.

## Recommendations (prioridade)
1. **Corrigir formato do atlas no WebGL**: alinhar `gl.texImage2D` para RGBA (ou mudar o engine para RGB). Hoje está inconsistente.
2. **Corrigir posicionamento X dos glifos**: no quad builder, usar penX acumulado (somatório de `xAdvance`) + `xOffset`, em vez de usar apenas `xOffset`.
3. **Corrigir passo vertical entre linhas** em `rebuildTextQuadBuffer` (usar `yTop += lineHeight` e baseline = `yTop + ascent`).
4. **Desambiguar naming**: trocar `charIndex` → `byteIndex` no TS/C++ onde aplicável, ou padronizar documentação para evitar bugs futuros.
5. **Completar edição de texto existente**: expor getter de conteúdo no engine (bindings) ou sincronizar state via snapshot/bridge.
6. **Shaping robusto**: parar de hardcode LTR/LATIN/en; usar `hb_buffer_guess_segment_properties` ou parametrizar direction/script/language.

## Files changed
- Adicionado este relatório: [resources/reports/report_27_text-tool-review.md](report_27_text-tool-review.md)

## Verification
Executado:
- `make -C cpp/build_native test`

Resultado:
- 119 testes executados
- 1 falha: `TextLayoutTest.CaretPositionStart`

Detalhe da falha:
- O teste espera `pos.y == 0`, mas a implementação retorna `pos.y` na baseline (comentado no código), o que dá `pos.y ≈ ascent`.
- Repro: `cd cpp/build_native && ctest --rerun-failed --output-on-failure`

Obs: esta falha parece ser um **mismatch de contrato** (baseline vs topo da linha), não necessariamente um bug do engine.
