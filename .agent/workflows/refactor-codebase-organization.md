---
description: Refatoração incremental de organização do codebase (estrutura, monólitos, stores)
---

# Prompt — Refatoração Incremental de Organização do Codebase

Você é um **Engenheiro de Software Sênior** realizando refatorações estruturais no projeto **EletroCAD Webapp**.

## ⚠️ REGRAS FUNDAMENTAIS — ZERO REGRESSÕES

### Contratos que NUNCA podem mudar:

1. **API pública do WASM** (exports em `bindings.cpp`, tipos expostos via Embind)
2. **Bridge APIs** (`TextBridge`, `commandBuffer` — assinaturas e contratos)
3. **Store shape pública** (propriedades expostas por `useDataStore`, `useUIStore`, `useSettingsStore`)
4. **Props públicas de componentes** exportados

### O que PODE mudar:

- Imports internos entre módulos
- Localização de arquivos
- Extração de código para novos arquivos/hooks/slices

### Regras de execução:

- ❌ Não mudar comportamento
- ❌ Não mudar API pública/contratos externos
- ❌ Não renomear exports públicos (WASM/bridge/store)
- ✅ Refatorar apenas por movimentação/extração

## Contexto do Projeto

Este é um projeto React + C++/WASM com arquitetura **engine-first**:

- O engine C++ (em `cpp/`) é o source of truth para layout, seleção, e geometrias
- O frontend React é apenas camada de View
- O renderer usa WebGL2 com passes separados (Geometry, Text)

## Escopo da Refatoração

Execute **uma fase por vez**, validando build e testes após cada fase.

---

## PRÉ-REQUISITO: Verificar Ambiente de Build

Antes de iniciar qualquer fase, valide que o ambiente está funcional:

```bash
# Build WASM (via Docker)
docker compose up

# Build frontend
cd frontend && pnpm install && pnpm type-check && pnpm build

# Testes C++ (se disponível)
cd cpp && mkdir -p build_test && cd build_test
cmake .. -DBUILD_TESTS=ON && make -j$(nproc)
ctest --output-on-failure
```

⚠️ **REGRA**: Sem build C++ funcional = Não executar FASE 1. Pule direto para FASE 2.

---

## FASE 1: Dividir `cpp/engine.cpp` (APENAS SE BUILD C++ FUNCIONAL)

### Pré-condição

```bash
# DEVE passar antes de começar:
cd cpp/build_test && ctest --output-on-failure
```

Se falhar: **PULE ESTA FASE**. Documente o problema e vá para FASE 2.

### Objetivo

Transformar `engine.cpp` em **binding/orquestração** (sem lógica de domínio).

### Meta de Responsabilidade (não de linhas)

✅ `engine.cpp` deve conter apenas:

- Includes
- Constructor/destructor
- Funções de coordenação entre subsistemas
- Nenhuma lógica de entidades ou rendering

### Passos

1. **Analisar dependências**:

   ```bash
   wc -l cpp/engine.cpp
   grep -n "#include" cpp/engine.cpp
   # Identificar grupos de funções
   ```

2. **Criar `cpp/engine/engine_entities.cpp`**:

   - Mover implementações de: `upsertRect`, `upsertLine`, `upsertPolyline`, `upsertSymbol`, `upsertNode`, `upsertConduit`, `upsertCircle`, `upsertPolygon`, `upsertArrow`, `deleteEntity`
   - **NÃO** alterar headers — apenas mover .cpp
   - Adicionar ao CMakeLists.txt:
     ```cmake
     set(ENGINE_SOURCES
       engine.cpp
       engine/engine_entities.cpp
       # ... outros
     )
     ```

3. **Criar `cpp/engine/engine_render.cpp`**:

   - Mover: `rebuildRenderBuffers`, `pushVertex`, `addRect`, `addRectOutline`, `addLineSegment`
   - Incluir headers necessários

4. **Verificar ODR e linker**:

   ```bash
   cd cpp/build_test && make clean && make -j$(nproc)
   ctest --output-on-failure
   ```

5. **Build WASM**:
   ```bash
   docker compose up
   ```

### Riscos e Mitigação

| Risco          | Mitigação                                       |
| -------------- | ----------------------------------------------- |
| ODR violations | Garantir que cada função está em apenas um .cpp |
| Linker errors  | Verificar includes e dependências               |
| Build quebrado | Reverter com `git checkout -- .`                |

### Critério de Sucesso

- [ ] `ctest` passa (todos os 13 arquivos de teste)
- [ ] `docker compose up` gera WASM válido
- [ ] `engine.cpp` contém apenas coordenação

---

## FASE 2: Extrair Hooks do `EngineInteractionLayer.tsx`

### Por que antes do Store?

O `EngineInteractionLayer` é o maior consumidor do store. Extraindo hooks primeiro:

- Reduzimos acoplamento
- Facilitamos a separação de slices depois
- Isolamos responsabilidades de gestos/interação

### Objetivo

Transformar `EngineInteractionLayer.tsx` em **composition root** (chama hooks, não contém lógica).

### Meta de Responsabilidade (não de linhas)

✅ `EngineInteractionLayer.tsx` deve conter apenas:

- Composição de hooks
- Render do JSX de overlays
- Delegação de eventos para hooks

### Passos

1. **Criar estrutura de hooks**:

   ```bash
   mkdir -p frontend/features/editor/hooks
   ```

2. **Criar `useSelectInteraction.ts`**:

   ```typescript
   // Extrair LITERALMENTE (copiar, não reescrever):
   // - Tipos: SelectInteraction, MoveState, ResizeState, VertexDragState
   // - Estados: selectInteraction, moveState, resizeState
   // - Handlers: handleMoveStart, handleMoveUpdate, handleMoveEnd
   // - Handlers: handleResizeStart, handleResizeUpdate, handleResizeEnd
   // - Handlers: handleVertexDrag
   // - Helper: applyResizeToShape (mover para utils se preferir)

   export function useSelectInteraction(params: {
     viewTransform: ViewTransform;
     selectedShapeIds: Set<string>;
     shapes: Record<string, Shape>;
     onUpdateShape: (id: string, diff: Partial<Shape>) => void;
     onSetSelectedShapeIds: (ids: Set<string>) => void;
   }) {
     // Código extraído literalmente do EngineInteractionLayer
     // NENHUMA mudança de lógica
   }
   ```

3. **Criar `useDraftHandler.ts`**:

   ```typescript
   // Extrair LITERALMENTE:
   // - Tipo: Draft
   // - Estado: draft
   // - Handlers por tool: handleLineDraft, handleRectDraft, etc.
   // - Lógica de snap (ou importar de utils existente)

   export function useDraftHandler(params: {
     activeTool: ToolType;
     viewTransform: ViewTransform;
     snapSettings: SnapSettings;
     onAddShape: (shape: Shape) => void;
   }) {
     // Código extraído literalmente
   }
   ```

4. **Criar `useTextEditHandler.ts`**:

   ```typescript
   // Extrair LITERALMENTE:
   // - Toda integração com TextTool
   // - Callbacks: onStateChange, onCaretUpdate, onSelectionUpdate
   // - Keyboard handlers para texto

   export function useTextEditHandler(params: {
     textTool: TextTool | null;
     viewTransform: ViewTransform;
     onTextCreated: (...) => void;
     onTextUpdated: (...) => void;
   }) {
     // Código extraído literalmente
   }
   ```

5. **Criar `useConduitHandler.ts`** (se necessário):

   ```typescript
   // Extrair lógica específica de eletrodutos
   ```

6. **Refatorar `EngineInteractionLayer.tsx`**:

   ```typescript
   function EngineInteractionLayer() {
     // Apenas composição:
     const selectInteraction = useSelectInteraction({ ... });
     const draftHandler = useDraftHandler({ ... });
     const textEdit = useTextEditHandler({ ... });

     // Event handlers delegam para hooks
     const handlePointerDown = (e) => {
       if (activeTool === 'select') selectInteraction.onPointerDown(e);
       else if (activeTool === 'text') textEdit.onPointerDown(e);
       else draftHandler.onPointerDown(e);
     };

     return (
       <div onPointerDown={handlePointerDown} ...>
         {/* overlays */}
       </div>
     );
   }
   ```

7. **Verificar**:
   ```bash
   cd frontend && pnpm type-check
   pnpm dev
   # Testar CADA funcionalidade:
   # - Select shape (click, marquee)
   # - Move shape
   # - Resize shape (todos os handles)
   # - Vertex drag (polyline)
   # - Desenhar cada tipo de forma
   # - Criar e editar texto
   # - Undo/Redo durante interações
   ```

### Riscos e Mitigação

| Risco                           | Mitigação                                 |
| ------------------------------- | ----------------------------------------- |
| Perder estado de pointer events | Mover código literalmente, sem reescrever |
| Bugs em gestos                  | Testar cada interação manualmente         |
| this binding quebrado           | Usar arrow functions ou useCallback       |

### Critério de Sucesso

- [ ] TypeScript compila sem erros
- [ ] Seleção de shapes funciona (click e marquee)
- [ ] Move funciona (drag com snap)
- [ ] Resize funciona (todos os 8 handles)
- [ ] Vertex drag funciona
- [ ] Todas as ferramentas de desenho funcionam
- [ ] Edição de texto funciona
- [ ] `EngineInteractionLayer.tsx` é composition root

---

## FASE 3: Separar `useDataStore.ts` em Slices

### Objetivo

Dividir o store monolítico mantendo a mesma **shape pública** (mesmos nomes de propriedades e métodos).

### Meta

✅ Consumidores do store NÃO devem precisar mudar imports ou chamadas.

### Estratégia de Import

```
frontend/stores/
├── useDataStore.ts          # Re-exporta store composto
├── slices/
│   ├── shapeSlice.ts
│   ├── layerSlice.ts
│   ├── historySlice.ts
│   └── electricalSlice.ts
```

### Passos

1. **Criar diretório de slices**:

   ```bash
   mkdir -p frontend/stores/slices
   ```

2. **Criar `shapeSlice.ts`**:

   ```typescript
   import { StateCreator } from 'zustand';
   import type { Shape } from '@/types';

   export interface ShapeSlice {
     shapes: Record<string, Shape>;
     shapeOrder: string[];
     addShape: (shape: Shape, electricalElement?: ..., diagram?: ...) => void;
     addShapes: (shapes: Array<...>) => void;
     updateShape: (id: string, diff: Partial<Shape>, recordHistory?: boolean) => void;
     deleteShape: (id: string) => void;
     deleteShapes: (ids: string[]) => void;
     alignSelected: (ids: string[], alignment: string) => void;
     rotateSelected: (ids: string[], pivot: Point, angle: number) => void;
   }

   export const createShapeSlice: StateCreator<
     DataState,
     [],
     [],
     ShapeSlice
   > = (set, get) => ({
     shapes: {},
     shapeOrder: [],
     // Copiar implementações LITERALMENTE do useDataStore
   });
   ```

3. **Criar `layerSlice.ts`**:

   ```typescript
   export interface LayerSlice {
     layers: Layer[];
     activeLayerId: string;
     setActiveLayerId: (id: string) => void;
     addLayer: () => void;
     deleteLayer: (id: string) => void;
     updateLayer: (id: string, updates: Partial<Layer>) => void;
     setLayerStrokeColor: (id: string, color: string) => void;
     setLayerFillColor: (id: string, color: string) => void;
     toggleLayerVisibility: (id: string) => void;
     toggleLayerLock: (id: string) => void;
   }

   export const createLayerSlice: StateCreator<...> = (set, get) => ({
     // Copiar implementações LITERALMENTE
   });
   ```

4. **Criar `historySlice.ts`**:

   ```typescript
   export interface HistorySlice {
     history: Patch[][];
     historyIndex: number;
     saveToHistory: (patches: Patch[]) => void;
     undo: () => void;
     redo: () => void;
   }

   export const createHistorySlice: StateCreator<...> = (set, get) => ({
     // Copiar implementações LITERALMENTE
   });
   ```

5. **Criar `electricalSlice.ts`**:

   ```typescript
   export interface ElectricalSlice {
     electricalElements: Record<string, ElectricalElement>;
     connectionNodes: Record<string, ConnectionNode>;
     diagramNodes: Record<string, DiagramNode>;
     diagramEdges: Record<string, DiagramEdge>;
     // ... todos os métodos relacionados
   }

   export const createElectricalSlice: StateCreator<...> = (set, get) => ({
     // Copiar implementações LITERALMENTE
   });
   ```

6. **Refatorar `useDataStore.ts`**:

   ```typescript
   import { create } from 'zustand';
   import { createShapeSlice, ShapeSlice } from './slices/shapeSlice';
   import { createLayerSlice, LayerSlice } from './slices/layerSlice';
   import { createHistorySlice, HistorySlice } from './slices/historySlice';
   import { createElectricalSlice, ElectricalSlice } from './slices/electricalSlice';

   // Tipo composto (MESMA shape pública de antes)
   export type DataState = ShapeSlice & LayerSlice & HistorySlice & ElectricalSlice & {
     // Funções de coordenação que precisam de múltiplos slices
     quadTree: QuadTree;
     syncQuadTree: () => void;
     syncConnections: () => void;
     syncDiagramEdgesGeometry: () => void;
     serializeProject: () => SerializedProject;
     loadSerializedProject: (data: ...) => void;
     resetDocument: () => void;
     ensureLayer: (name: string, defaults?: ...) => string;
     setVectorSidecar: (sidecar: VectorSidecar | null) => void;
   };

   export const useDataStore = create<DataState>()((...args) => ({
     ...createShapeSlice(...args),
     ...createLayerSlice(...args),
     ...createHistorySlice(...args),
     ...createElectricalSlice(...args),

     // Funções de coordenação que ficam aqui
     quadTree: initialQuadTree,
     syncQuadTree: () => { /* ... */ },
     // ... resto
   }));
   ```

7. **Verificar**:
   ```bash
   cd frontend && pnpm type-check
   pnpm dev
   # Testar:
   # - Criar/editar/deletar shapes
   # - Undo/Redo (múltiplas vezes)
   # - Criar/editar layers
   # - Elementos elétricos
   # - Salvar projeto (download)
   # - Carregar projeto (upload)
   ```

### Riscos e Mitigação

| Risco                              | Mitigação                                                  |
| ---------------------------------- | ---------------------------------------------------------- |
| Dependências cruzadas entre slices | Funções que usam múltiplos slices ficam no store principal |
| `this` binding                     | StateCreator cuida disso; usar `get()` para acessar estado |
| Tipo `DataState` quebrado          | Definir tipo como união de todos os slices                 |

### Critério de Sucesso

- [ ] TypeScript compila sem erros
- [ ] Nenhum consumidor do store precisou mudar
- [ ] Criar/editar/deletar shapes funciona
- [ ] Undo/Redo funciona (incluindo edge cases)
- [ ] Layers funcionam
- [ ] Serialização/deserialização funciona

---

## FASE 4: Reorganizar Estrutura de Diretórios Frontend

### Pré-requisito: Definir Import Strategy

Antes de mover qualquer arquivo, definir e DOCUMENTAR as regras:

```markdown
# Regras de Localização de Arquivos

1. **UI reutilizável genérica** → `frontend/components/`

   - ColorPicker, NumberSpinner, CustomSelect, LoadingOverlay

2. **UI específica de editor** → `frontend/features/editor/components/`

   - EditorRibbon, EditorSidebar, SelectionOverlay, StrokeOverlay

3. **Engine/render/WASM** → `frontend/engine/`

   - bridge/, core/, renderer/, picking/, tools/

4. **Overlays de interação** → `frontend/features/editor/components/`
   - EngineInteractionLayer, NextSurface
```

### Atualizar tsconfig.json (primeiro!)

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./frontend/*"],
      "@/engine/*": ["./frontend/engine/*"],
      "@/features/*": ["./frontend/features/*"],
      "@/components/*": ["./frontend/components/*"],
      "@/stores/*": ["./frontend/stores/*"]
    }
  }
}
```

### Passos

1. **Mover arquivos de `frontend/src/components/`**:

   ```bash
   # EngineInteractionLayer → frontend/features/editor/components/
   mv frontend/src/components/EngineInteractionLayer.tsx \
      frontend/features/editor/components/

   # SelectionOverlay → frontend/features/editor/components/
   mv frontend/src/components/SelectionOverlay.tsx \
      frontend/features/editor/components/

   # StrokeOverlay → frontend/features/editor/components/
   mv frontend/src/components/StrokeOverlay.tsx \
      frontend/features/editor/components/

   # NextSurface → frontend/features/editor/components/
   mv frontend/src/components/NextSurface.tsx \
      frontend/features/editor/components/

   # TessellatedWasmLayer → frontend/engine/renderer/
   mv frontend/src/components/TessellatedWasmLayer.tsx \
      frontend/engine/renderer/
   ```

2. **Atualizar imports com busca global**:

   ```bash
   # Encontrar todos os arquivos que importam os movidos
   grep -r "from.*src/components" frontend/
   grep -r "from.*EngineInteractionLayer" frontend/
   # etc.
   ```

3. **Verificar após cada arquivo movido**:

   ```bash
   cd frontend && pnpm type-check
   ```

4. **Remover `frontend/src/` se vazio**:

   ```bash
   rmdir frontend/src/components frontend/src/next frontend/src 2>/dev/null || true
   ```

5. **Verificação final**:
   ```bash
   cd frontend && pnpm type-check && pnpm build
   pnpm dev  # Smoke test visual
   ```

### Riscos e Mitigação

| Risco                 | Mitigação                                         |
| --------------------- | ------------------------------------------------- |
| Imports quebrados     | Atualizar um arquivo por vez, verificar após cada |
| Alias não reconhecido | Verificar tsconfig.json e vite.config.ts          |
| Circular imports      | Manter mesma estrutura de dependências            |

### Critério de Sucesso

- [ ] Build passa
- [ ] `frontend/src/` removido
- [ ] Estrutura de diretórios consistente
- [ ] Aplicação funciona normalmente

---

## FASE 5: Mover TextTool para engine/

### Objetivo

Colocar TextTool junto com outros arquivos de engine coordination.

### Passos

1. **Criar diretório**:

   ```bash
   mkdir -p frontend/engine/tools
   ```

2. **Mover arquivo**:

   ```bash
   mv frontend/features/editor/tools/TextTool.ts frontend/engine/tools/
   mv frontend/features/editor/tools/index.ts frontend/engine/tools/ 2>/dev/null || true
   ```

3. **Atualizar imports**:

   ```bash
   grep -r "from.*features/editor/tools" frontend/
   # Atualizar cada ocorrência para @/engine/tools
   ```

4. **Verificar**:
   ```bash
   cd frontend && pnpm type-check
   pnpm dev  # Testar edição de texto
   ```

### Critério de Sucesso

- [ ] TypeScript compila
- [ ] Edição de texto funciona

---

## Ordem de Execução FINAL

```
┌─────────────────────────────────────────────────────────────┐
│  PRÉ-REQUISITO: Verificar ambiente de build                │
│  └─ Se C++ build falha → PULAR FASE 1                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE 1: Dividir engine.cpp (SE BUILD C++ OK)              │
│  └─ Meta: engine.cpp vira binding/orquestração             │
│  └─ Verificar: ctest + docker compose up                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE 2: Extrair hooks do EngineInteractionLayer           │
│  └─ Meta: composition root (delega para hooks)             │
│  └─ Verificar: type-check + teste manual de gestos         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE 3: Separar useDataStore em slices                    │
│  └─ Meta: mesma shape pública, implementação modular       │
│  └─ Verificar: type-check + undo/redo + serialização       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE 4: Reorganizar estrutura de diretórios               │
│  └─ Definir import strategy ANTES                          │
│  └─ Verificar: build + smoke test                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE 5: Mover TextTool                                    │
│  └─ Baixo risco                                            │
│  └─ Verificar: type-check + edição de texto                │
└─────────────────────────────────────────────────────────────┘
```

## Checklist de Risco por Fase

| Fase         | Risco                 | Mitigação                        |
| ------------ | --------------------- | -------------------------------- |
| 1 (C++)      | ODR/linker            | Build obrigatório antes e depois |
| 2 (EIL)      | Gestos quebrados      | Mover código literalmente        |
| 3 (Store)    | Dependências cruzadas | Manter shape pública idêntica    |
| 4 (Dirs)     | Imports quebrados     | Alias + verificação por arquivo  |
| 5 (TextTool) | Baixo                 | Move simples                     |

## Após Cada Fase

1. Rodar build completo
2. Rodar testes (se aplicável)
3. Testar manualmente as funcionalidades afetadas
4. Commitar com mensagem clara:

   ```
   refactor(structure): FASE X - <descrição breve>

   - O que foi movido/extraído
   - Nenhuma mudança funcional
   ```

## Verificação Final Completa

Após todas as fases:

```bash
# Build WASM (se aplicável)
docker compose up

# Build frontend
cd frontend && pnpm build

# Testes C++ (se aplicável)
cd cpp/build_test && ctest --output-on-failure

# TypeScript
cd frontend && pnpm type-check

# Teste manual completo
pnpm dev
# Checklist:
# [ ] Criar retângulo, linha, círculo, polígono, seta
# [ ] Selecionar shape (click)
# [ ] Selecionar múltiplos (marquee LTR e RTL)
# [ ] Mover shape (com snap)
# [ ] Redimensionar shape (todos os handles)
# [ ] Rotação de shape
# [ ] Criar e editar texto
# [ ] Mudar fonte, tamanho, estilo do texto
# [ ] Undo/Redo (10+ vezes)
# [ ] Criar/editar/deletar layers
# [ ] Mudar layer de shape
# [ ] Elementos elétricos (símbolos, conduits)
# [ ] Salvar projeto (download JSON)
# [ ] Carregar projeto (upload JSON)
# [ ] Zoom e pan
```
