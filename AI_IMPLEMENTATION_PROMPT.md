# AI Implementation Prompt

Use o prompt abaixo para instruir um Agente de IA a executar as melhorias sugeridas no relatório.

---

**Prompt:**

```markdown
Você é um Arquiteto de Software Sênior especialista em React, Zustand e Canvas.
Sua tarefa é refatorar o frontend do projeto "ElectroCad Web" para resolver problemas de performance e arquitetura identificados.

**Contexto:**
O projeto é um editor CAD 2D. Atualmente, o Store (Zustand) é monolítico e o Canvas re-renderiza excessivamente. Precisamos separar as responsabilidades e otimizar o ciclo de renderização.

**Tarefas Prioritárias:**

1.  **Refatoração do Store (Zustand):**
    *   Divida o `useAppStore.ts` em dois slices ou stores separados:
        *   `useDataStore`: Responsável por `shapes`, `layers`, `history` (undo/redo) e `spatialIndex`.
        *   `useUIStore`: Responsável por `activeTool`, `viewTransform`, `mousePos`, `modals` e `sidebarTab`.
    *   Garanta que a comunicação entre eles (ex: Undo afetando a seleção) funcione corretamente.

2.  **Otimização do Canvas (`EditorCanvas.tsx`):**
    *   O `mousePos` não deve causar re-renderização de todo o Canvas. Refatore para que o movimento do mouse apenas atualize referências ou componentes isolados (como o StatusBar ou Cursor Overlay).
    *   Avalie a criação de um componente `DynamicOverlay` separado do `StaticCanvas` para desenhar interações (seleção, snap lines) sem redesenhar todas as formas.

3.  **Decomposição de Componentes:**
    *   Refatore o `EditorSidebar.tsx`. Extraia as seções de propriedades (Posição, Dimensões, Estilo) para componentes menores em `features/editor/components/properties/`.
    *   Crie a pasta `frontend/hooks` e mova a lógica de atalhos de teclado (`App.tsx`) para um hook `useKeyboardShortcuts`.

4.  **Spatial Index:**
    *   Otimize o método `syncQuadTree`. Evite recriar a árvore inteira a cada movimento. Se possível, implemente atualização apenas do objeto modificado.

**Restrições:**
*   Mantenha a funcionalidade existente intacta.
*   Siga o `project-guidelines.md` (Feature-First Architecture).
*   Use TypeScript estrito.

**Saída Esperada:**
O código refatorado deve ser mais modular, e o Canvas deve manter 60fps mesmo com muitos objetos, evitando re-renders desnecessários.
```
