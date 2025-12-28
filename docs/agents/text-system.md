# Text System

> Documentação do sistema de texto do Engine.

---

## 1. Visão Geral

O sistema de texto é **Engine-native**:

- Layout calculado no C++
- Glyph atlas gerenciado pelo Engine
- Rich text com múltiplos runs de estilo
- Renderizado como quads via WebGL2

---

## 2. Arquitetura

```
cpp/engine/text/
├── font_manager.*      # Carregamento de fontes (FreeType)
├── glyph_atlas.*       # Atlas de texturas para glyphs
├── text_layout.*       # Cálculo de layout e line breaking
├── text_store.*        # Armazenamento de entidades de texto
└── text_types.h        # Tipos compartilhados
```

---

## 3. Modos de Texto

| Modo           | Descrição                        | Quando usar           |
| -------------- | -------------------------------- | --------------------- |
| **AutoWidth**  | Cresce horizontalmente, sem wrap | Click para criar      |
| **FixedWidth** | Wrap no limite de largura        | Drag para criar caixa |

---

## 4. TextTool (Frontend)

Localização: `frontend/engine/tools/TextTool.ts`

### Criar Texto

```typescript
// Click → AutoWidth
textTool.handleClick(worldX, worldY);

// Drag → FixedWidth com largura definida
textTool.handleDrag(startX, startY, endX, endY);
```

### Editar Texto

```typescript
// Iniciar edição em texto existente
textTool.handlePointerDown(textId, localX, localY, shiftKey, ...);

// Processar input do teclado
textTool.handleInputDelta({
  beforeSelection: '',
  selection: '',
  afterSelection: 'a',  // Caractere inserido
  ...
});

// Navegação
textTool.handleSelectionChange(start, end);
```

### Aplicar Estilos

```typescript
textTool.applyTextAlign(TextAlign.Center);
textTool.applyBoldStyle(textId, true);
textTool.applyFontIdToText(textId, fontId);
```

---

## 5. Rich Text (Runs)

Texto pode ter múltiplos **runs** com estilos diferentes:

```typescript
interface TextRun {
  startIndex: number; // Byte offset no conteúdo UTF-8
  length: number; // Tamanho em bytes
  fontId: number;
  fontSize: number;
  colorRGBA: number; // Packed 0xRRGGBBAA
  flags: TextStyleFlags; // Bold, Italic, Underline, Strike
}
```

---

## 6. Commands de Texto

| Command             | Descrição                      |
| ------------------- | ------------------------------ |
| `UpsertText`        | Criar/atualizar texto completo |
| `InsertTextContent` | Inserir texto em posição       |
| `DeleteTextContent` | Deletar range de texto         |
| `SetTextCaret`      | Definir posição do caret       |
| `SetTextSelection`  | Definir range de seleção       |
| `ApplyTextStyle`    | Aplicar estilo a range         |
| `SetTextAlign`      | Definir alinhamento            |
| `DeleteText`        | Remover entidade de texto      |

---

## 7. Queries de Texto

```typescript
// Conteúdo
const meta = runtime.getTextContentMeta(textId);
// meta.ptr → ponteiro WASM para UTF-8
// meta.byteCount → tamanho em bytes

// Bounds
const bounds = runtime.getTextBounds(textId);
// { minX, minY, maxX, maxY, valid }

// Posição do caret
const caretPos = runtime.getTextCaretPosition(textId, charIndex);
// { x, y, height, lineIndex }

// Estado de estilo (para UI)
const snapshot = runtime.getTextStyleSnapshot(textId);
// { fontId, fontSize, bold, italic, align, ... }
```

---

## 8. Text Input Proxy

Componente: `frontend/components/TextInputProxy.tsx`

Bridge entre input nativo do browser e o Engine:

1. Captura keydown/input events
2. Calcula delta (inserção/deleção)
3. Chama `textTool.handleInputDelta()`
4. Engine processa e atualiza
5. Frontend recebe posição do caret para overlay

---

## 9. Rendering

1. Engine calcula **text quads** (6 vértices por glyph)
2. Frontend lê buffer via `getTextQuadBufferMeta()`
3. WebGL2 renderiza usando atlas texture

```typescript
const quadMeta = runtime.getTextQuadBufferMeta();
const atlasMeta = runtime.getAtlasTextureMeta();
// Upload para GPU e render
```

---

## 10. Regras Importantes

| ✅ Faça                                      | ❌ Não Faça                      |
| -------------------------------------------- | -------------------------------- |
| Use `getTextContentMeta()` para ler conteúdo | Manter cópia de content no React |
| Use `getTextCaretPosition()` para caret      | Calcular posição de caret no JS  |
| Envie commands para modificar texto          | Manipular strings no frontend    |
| Confie no Engine para layout                 | Fazer text wrapping no JS        |
