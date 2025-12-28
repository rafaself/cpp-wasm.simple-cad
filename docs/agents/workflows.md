# Development Workflows

> Receitas práticas para tarefas comuns.

---

## 1. Adicionar Nova Ferramenta de Desenho

### Passos

1. **C++ (se necessário)**

   - Adicionar novo tipo em `cpp/engine/types.h`
   - Adicionar CommandOp em `cpp/engine/commands.h`
   - Implementar handler em `engine.cpp` (`cad_command_callback`)
   - Expor via Embind em `cpp/engine/bindings.cpp`

2. **Frontend Command**

   - Adicionar CommandOp em `frontend/engine/core/commandBuffer.ts`
   - Implementar payload e encoding

3. **Tool/Hook**

   - Adicionar lógica em `frontend/features/editor/hooks/useDraftHandler.ts`
   - Ou criar novo hook se comportamento muito diferente

4. **UI**
   - Adicionar ToolType em `frontend/types/index.ts`
   - Adicionar botão no toolbar (`frontend/features/editor/ribbon/`)

---

## 2. Adicionar Propriedade a Shape Existente

### Passos

1. **C++ Struct**

   - Modificar struct em `types.h` (ex: `RectRec`)
   - Atualizar payload struct se necessário

2. **Snapshot**

   - Se propriedade persistida, atualizar `snapshot.cpp`
   - Considerar migração de formato

3. **Frontend**

   - Atualizar payload interface em `commandBuffer.ts`
   - Atualizar encoding em `encodeCommandBuffer()`

4. **UI**
   - Adicionar controle no painel de propriedades

---

## 3. Modificar Comportamento de Seleção

### Localização

- Engine: `cpp/engine/entity_manager.cpp` (selectEntity, queryMarquee)
- Frontend: `frontend/features/editor/components/EngineInteractionLayer.tsx`

### Pattern

```typescript
// Frontend captura input
const modifiers = selectionModifiersFromEvent(evt);
runtime.selectEntity(pick.id, SelectionMode.Toggle, modifiers);
```

---

## 4. Adicionar Nova Operação de Transformação

### Passos

1. **C++**

   - Adicionar novo `TransformMode` em `engine.h`
   - Implementar lógica em `updateTransform()`
   - Adicionar `TransformOpCode` para commit result

2. **Frontend**
   - Mapear em `interactionSession.ts`
   - Atualizar `EngineInteractionLayer.tsx` para iniciar a transformação

---

## 5. Debug de Rendering

### Verificar Estado do Engine

```typescript
const stats = runtime.getEngineStats();
console.log("Rects:", stats.rectCount, "Lines:", stats.lineCount);
```

### Verificar Buffers

```typescript
const meta = runtime.getTriangleBufferMeta();
console.log("Triangle vertices:", meta.vertexCount);
```

### Forçar Rebuild

```typescript
runtime.rebuildRenderBuffers();
```

---

## 6. Debug de Texto

### Verificar Conteúdo

```typescript
const meta = runtime.getTextContentMeta(textId);
const bytes = new Uint8Array(
  runtime.module.HEAPU8.buffer,
  meta.ptr,
  meta.byteCount
);
const content = new TextDecoder().decode(bytes);
console.log("Content:", content);
```

### Verificar Caret

```typescript
const caretPos = runtime.getTextCaretPosition(textId, charIndex);
console.log("Caret at:", caretPos.x, caretPos.y);
```

---

## 7. Build e Teste

### Build Completo

```bash
make fbuild
```

### Apenas Frontend (Dev)

```bash
cd frontend && pnpm dev
```

### Rebuild WASM (Após alterações C++)

```bash
cd frontend && pnpm build:wasm
```

### Testes C++

```bash
cd cpp/build_native
cmake ..
make
ctest --output-on-failure
```

### Testes Frontend

```bash
cd frontend && npx vitest run
```

---

## 8. Checklist Antes de Commit

- [ ] Testes C++ passando (`ctest`)
- [ ] Testes Frontend passando (`npx vitest run`)
- [ ] Build completo funciona (`make fbuild`)
- [ ] Sem `console.log` de debug em produção
- [ ] Sem `any` não justificado em TypeScript
- [ ] Não introduziu shadow state no Zustand
