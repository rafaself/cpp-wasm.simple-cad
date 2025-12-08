# Relatório de Revisão do Frontend - ElectroCad Web

## 1. Resumo Executivo

A base de código atual demonstra uma estrutura sólida para um MVP, utilizando tecnologias modernas (React 19, Zustand, Vite). No entanto, para escalar para um sistema CAD profissional, observam-se gargalos significativos em **gerenciamento de estado** e **performance de renderização**. A estrutura monolítica do Store e componentes grandes dificultam a manutenção e otimização futura.

Este relatório detalha pontos críticos e sugere correções imediatas para garantir escalabilidade e performance.

---

## 2. Arquitetura e Gerenciamento de Estado

### Problema: Store Monolítico (`useAppStore.ts`)
Atualmente, `useAppStore` mistura **Dados do Documento** (Shapes, Layers, History - críticos e pesados) com **Estado de UI** (Abas laterais, Modais, Zoom, Ferramenta ativa - voláteis).
*   **Impacto:** Qualquer alteração na UI (ex: mudar de aba) pode causar re-renderizações desnecessárias em componentes que só deveriam ouvir alterações de dados, e vice-versa.
*   **Risco de Performance:** Atualizações de alta frequência (como `mousePos`) estão no mesmo store que a árvore de objetos, o que é perigoso para a performance do Canvas.

### Recomendação
Adotar o padrão de **Slices** do Zustand ou separar em dois stores distintos:
1.  `useDataStore`: Apenas dados persistentes (Shapes, Layers, QuadTree, History).
2.  `useUIStore`: Estado da interface (Ferramenta ativa, Zoom, Modais, Posição do Mouse).

---

## 3. Performance de Renderização

### Problema: Ciclo de Renderização do Canvas
O componente `EditorCanvas.tsx` é re-renderizado frequentemente.
*   **Mouse Move:** O evento `onMouseMove` atualiza `store.mousePos`, que dispara atualizações em componentes inscritos. Se o Canvas estiver inscrito a isso, ele redesenha todo o quadro a cada pixel de movimento do mouse.
*   **QuadTree Sync:** O método `syncQuadTree` limpa e reinsere **todos** os objetos a cada atualização (`updateShape`). Isso é uma operação $O(N)$ que degradará rapidamente com >1000 objetos.

### Recomendação
1.  **Transient Updates:** Para coordenadas do mouse, considerar usar `useRef` ou um store separado que não dispara re-render do componente principal do Canvas, apenas do componente de UI que mostra as coordenadas (StatusBar).
2.  **Otimização da QuadTree:** Implementar atualizações incrementais (remover/inserir apenas o objeto modificado) ao invés de *full rebuild*.
3.  **Canvas Layers:** Separar o Canvas em dois:
    *   `StaticCanvas`: Desenha formas e grid (só atualiza quando o documento muda).
    *   `DynamicCanvas`: Camada transparente superior para desenhar seleção, *snapping* e interações temporárias (atualiza a 60fps).

---

## 4. Organização e Estrutura de Código

### Problema: "God Components"
Alguns componentes acumularam muitas responsabilidades:
*   `EditorSidebar.tsx` (~500 linhas): Contém lógica de renderização para todos os tipos de propriedades de objetos.
*   `EditorCanvas.tsx` (~500 linhas): Mistura lógica de eventos de mouse, regras de negócio de criação de formas e renderização.

### Problema: Diretórios Ausentes
*   A pasta `frontend/hooks` é referenciada nos guidelines mas não existe. Lógicas como *Key Bindings* (`App.tsx`) e *Window Resize* (`EditorCanvas.tsx`) deveriam ser extraídas para Custom Hooks globais.

### Recomendação
1.  **Refatorar Sidebar:** Criar subcomponentes em `features/editor/components/properties/`:
    *   `PositionSection.tsx`
    *   `DimensionsSection.tsx`
    *   `StyleSection.tsx`
2.  **Refatorar Canvas:** Extrair *Event Handlers* para um hook `useCanvasEvents.ts`.

---

## 5. Qualidade de Código e Tipagem

### Problema: Uso de `any` e Tipagem Implícita
Em `useAppStore.ts`, a função `_applyTextStyle` usa `(prev as any)[k]`. Embora funcional, isso enfraquece o TypeScript.

### Recomendação
Reforçar a tipagem das atualizações parciais usando `Partial<Shape>` e Type Guards adequados.

---

## 6. Plano de Ação Prioritário

1.  **Refatorar Store:** Separar `Data` de `UI`.
2.  **Otimizar Canvas:** Isolar atualizações de mouse e desacoplar renderização estática de dinâmica.
3.  **Componentização:** Quebrar a Sidebar e o Canvas em partes menores.
4.  **Criar Hooks:** Mover lógica de eventos para `frontend/hooks`.
