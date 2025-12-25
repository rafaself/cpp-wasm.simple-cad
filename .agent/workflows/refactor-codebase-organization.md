---
description: Refatoração incremental de organização do codebase (estrutura, monólitos, stores)
---

# Prompt — Refatoração Incremental de Organização do Codebase

Você é um **Engenheiro de Software Sênior** realizando refatorações estruturais no projeto **EletroCAD Webapp**.

## ⚠️ REGRA FUNDAMENTAL — ZERO REGRESSÕES

Antes de qualquer alteração:

1. O build DEVE passar: `make fbuild` e `make build`
2. Os testes C++ DEVEM passar: `cd cpp/build_test && ctest --output-on-failure`
3. **NUNCA** altere lógica de negócio, apenas mova/reorganize código
4. **NUNCA** renomeie funções/métodos públicos ou APIs
5. **NUNCA** altere assinaturas de funções
6. **SEMPRE** preserve todos os imports e exports existentes

## Contexto do Projeto

Este é um projeto React + C++/WASM com arquitetura **engine-first**:

- O engine C++ (em `cpp/`) é o source of truth para layout, seleção, e geometrias
- O frontend React é apenas camada de View
- O renderer usa WebGL2 com passes separados (Geometry, Text)

## Escopo da Refatoração

Execute **uma fase por vez**, validando build e testes após cada fase.

---

## FASE 1: Dividir `cpp/engine.cpp` (1964 linhas)

### Objetivo

Extrair implementações do `engine.cpp` para arquivos separados em `cpp/engine/`.

### Passos

1. **Analisar dependências**:

   ```bash
   # Ver estrutura atual
   wc -l cpp/engine.cpp
   # Verificar includes
   grep -n "#include" cpp/engine.cpp
   ```

2. **Criar `cpp/engine/engine_entities.cpp`**:

   - Mover implementações de: `upsertRect`, `upsertLine`, `upsertPolyline`, `upsertSymbol`, `upsertNode`, `upsertConduit`, `upsertCircle`, `upsertPolygon`, `upsertArrow`, `deleteEntity`
   - Manter assinaturas em `engine.h`
   - Adicionar include no CMakeLists.txt

3. **Criar `cpp/engine/engine_render.cpp`**:

   - Mover: `rebuildRenderBuffers`, `pushVertex`, `addRect`, `addRectOutline`, `addLineSegment`
   - Manter assinaturas em `engine.h`

4. **Criar `cpp/engine/engine_snapshot.cpp`** (se não existir):

   - Mover: `loadSnapshotFromPtr`, `rebuildSnapshotBytes`, `getSnapshotBufferMeta`

5. **Verificar**:

   ```bash
   cd cpp && mkdir -p build_test && cd build_test
   cmake .. -DBUILD_TESTS=ON && make -j$(nproc)
   ctest --output-on-failure
   ```

6. **Atualizar engine.cpp**:
   - Deve conter apenas includes e funções de coordenação leves
   - Meta: < 500 linhas

### Critério de Sucesso

- [ ] Build passa
- [ ] Todos os 13 arquivos de teste passam
- [ ] `engine.cpp` tem < 500 linhas
- [ ] Nenhuma API pública foi alterada

---

## FASE 2: Extrair Hooks do `EngineInteractionLayer.tsx` (2293 linhas)

### Objetivo

Criar hooks customizados para responsabilidades específicas.

### Passos

1. **Criar `frontend/features/editor/hooks/useSelectInteraction.ts`**:

   ```typescript
   // Extrair lógica de:
   // - SelectInteraction type
   // - MoveState, ResizeState, VertexDragState
   // - Handlers de marquee, move, resize, vertex drag

   export function useSelectInteraction(params: {
     viewTransform: ViewTransform;
     selectedShapeIds: Set<string>;
     shapes: Record<string, Shape>;
     onUpdateShape: (id: string, diff: Partial<Shape>) => void;
   }) {
     // ... extrair lógica existente
   }
   ```

2. **Criar `frontend/features/editor/hooks/useDraftHandler.ts`**:

   ```typescript
   // Extrair lógica de:
   // - Draft type e estados
   // - Handlers de pointerDown/Move/Up para cada tool
   // - Lógica de snap

   export function useDraftHandler(params: {
     activeTool: ToolType;
     viewTransform: ViewTransform;
     snapSettings: SnapSettings;
   }) {
     // ... extrair lógica existente
   }
   ```

3. **Criar `frontend/features/editor/hooks/useTextEditHandler.ts`**:

   ```typescript
   // Extrair lógica de:
   // - Integração com TextTool
   // - Callbacks de caret/selection
   // - Keyboard handling para texto

   export function useTextEditHandler(params: {
     textTool: TextTool | null;
     viewTransform: ViewTransform;
   }) {
     // ... extrair lógica existente
   }
   ```

4. **Refatorar `EngineInteractionLayer.tsx`**:

   - Usar os novos hooks
   - Manter apenas orquestração e JSX
   - Meta: < 800 linhas

5. **Verificar**:
   ```bash
   cd frontend && pnpm type-check
   pnpm dev  # Testar manualmente: select, move, resize, text edit
   ```

### Critério de Sucesso

- [ ] TypeScript compila sem erros
- [ ] Seleção de shapes funciona
- [ ] Move/resize funciona
- [ ] Edição de texto funciona
- [ ] Desenho de novas formas funciona
- [ ] `EngineInteractionLayer.tsx` < 800 linhas

---

## FASE 3: Separar `useDataStore.ts` em Slices (1090 linhas)

### Objetivo

Dividir o store monolítico em slices menores com responsabilidades claras.

### Passos

1. **Criar `frontend/stores/slices/shapeSlice.ts`**:

   ```typescript
   // Extrair:
   // - shapes, shapeOrder
   // - addShape, addShapes, updateShape, deleteShape, deleteShapes
   // - alignSelected, rotateSelected

   export interface ShapeSlice {
     shapes: Record<string, Shape>;
     shapeOrder: string[];
     addShape: (shape: Shape, ...) => void;
     // ...
   }

   export const createShapeSlice: StateCreator<DataState, [], [], ShapeSlice> = (set, get) => ({
     // ...
   });
   ```

2. **Criar `frontend/stores/slices/layerSlice.ts`**:

   ```typescript
   // Extrair:
   // - layers, activeLayerId
   // - addLayer, deleteLayer, updateLayer
   // - setLayerStrokeColor, setLayerFillColor, toggleLayerVisibility, toggleLayerLock
   ```

3. **Criar `frontend/stores/slices/historySlice.ts`**:

   ```typescript
   // Extrair:
   // - history, historyIndex
   // - saveToHistory, undo, redo
   ```

4. **Criar `frontend/stores/slices/electricalSlice.ts`**:

   ```typescript
   // Extrair:
   // - electricalElements, connectionNodes, diagramNodes, diagramEdges
   // - addElectricalElement, updateElectricalElement, deleteElectricalElement
   // - createFreeConnectionNode, getOrCreateAnchoredConnectionNode, addConduitBetweenNodes
   ```

5. **Refatorar `useDataStore.ts`**:

   ```typescript
   import { createShapeSlice } from "./slices/shapeSlice";
   import { createLayerSlice } from "./slices/layerSlice";
   import { createHistorySlice } from "./slices/historySlice";
   import { createElectricalSlice } from "./slices/electricalSlice";

   export const useDataStore = create<DataState>()((...args) => ({
     ...createShapeSlice(...args),
     ...createLayerSlice(...args),
     ...createHistorySlice(...args),
     ...createElectricalSlice(...args),
     // Funções de coordenação: serializeProject, loadSerializedProject, resetDocument
   }));
   ```

6. **Verificar**:
   ```bash
   cd frontend && pnpm type-check
   pnpm dev  # Testar: criar shapes, layers, undo/redo, electrical
   ```

### Critério de Sucesso

- [ ] TypeScript compila sem erros
- [ ] Criar/editar/deletar shapes funciona
- [ ] Undo/Redo funciona
- [ ] Layers funcionam
- [ ] Elementos elétricos funcionam
- [ ] Serialização/deserialização de projeto funciona

---

## FASE 4: Reorganizar Estrutura de Diretórios Frontend

### Objetivo

Eliminar ambiguidades entre `frontend/src/` e `frontend/components/`.

### Passos

1. **Mover arquivos de `frontend/src/components/`**:

   ```bash
   # EngineInteractionLayer → frontend/features/editor/components/
   # SelectionOverlay → frontend/features/editor/components/
   # StrokeOverlay → frontend/features/editor/components/
   # NextSurface → frontend/features/editor/components/
   # TessellatedWasmLayer → frontend/engine/renderer/
   ```

2. **Atualizar imports**:

   - Usar find-and-replace em todos os arquivos
   - Verificar aliases TypeScript em `tsconfig.json`

3. **Remover `frontend/src/` se vazio**

4. **Verificar**:
   ```bash
   cd frontend && pnpm type-check
   pnpm build  # Build de produção para garantir
   ```

### Critério de Sucesso

- [ ] Build passa
- [ ] Aplicação funciona normalmente
- [ ] Estrutura de diretórios está consistente

---

## FASE 5: Mover TextTool para engine/

### Objetivo

Colocar TextTool junto com outros arquivos de engine.

### Passos

1. **Mover arquivo**:

   ```bash
   mv frontend/features/editor/tools/TextTool.ts frontend/engine/tools/TextTool.ts
   ```

2. **Atualizar imports**:

   - Verificar todos os arquivos que importam TextTool
   - Atualizar path aliases se necessário

3. **Verificar**:
   ```bash
   cd frontend && pnpm type-check
   pnpm dev  # Testar edição de texto
   ```

---

## Ordem de Execução Recomendada

1. **FASE 1** (C++ - mais isolado, menor risco)
2. **FASE 3** (Stores - mudança interna, menor impacto visual)
3. **FASE 2** (EngineInteractionLayer - mais complexo)
4. **FASE 4** (Estrutura de diretórios - apenas moves)
5. **FASE 5** (TextTool - move simples)

## Após Cada Fase

1. Rodar build completo
2. Rodar testes
3. Testar manualmente as funcionalidades afetadas
4. Commitar com mensagem clara:

   ```
   refactor(structure): [FASE X] <descrição breve>

   - O que foi movido/extraído
   - Nenhuma mudança funcional
   ```

## Anti-Patterns a Evitar

- ❌ Não renomear funções/métodos
- ❌ Não alterar tipos ou interfaces
- ❌ Não mudar lógica de negócio "aproveitando" a refatoração
- ❌ Não fazer múltiplas fases na mesma sessão sem validar
- ❌ Não ignorar erros de TypeScript/compilação
- ❌ Não assumir que "vai funcionar" — sempre testar

## Verificação Final

Após todas as fases:

```bash
# Build WASM
docker compose up

# Build frontend
cd frontend && pnpm build

# Testes C++
cd cpp/build_test && ctest --output-on-failure

# TypeScript
cd frontend && pnpm type-check

# Teste manual completo
pnpm dev
# - Criar retângulo, linha, polígono
# - Selecionar, mover, redimensionar
# - Criar e editar texto
# - Undo/Redo
# - Layers
# - Salvar/Carregar projeto
```
