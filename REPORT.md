# Relatório de Investigação: Text Tool Bug

## 1. Hipóteses Priorizadas

### A) Text Runs Desatualizados (Alta Probabilidade)
**Hipótese:** A `TextTool` inicializa a entidade de texto com um "run" de estilo de comprimento 0 (`length: 0`). Ao inserir texto via `handleInputDelta` -> `insertContentByteIndex`, o conteúdo muda, mas os metadados de estilo (runs) não são atualizados para cobrir os novos caracteres. Se o engine renderiza apenas texto coberto por runs definidos, o texto inserido permanece invisível.
**Teste:** Alterar `createTextEntity` para usar um comprimento inicial grande (ex: 100) ou forçar atualização dos runs após cada input.

### B) Falha no Carregamento de Fontes
**Hipótese:** O HarfBuzz/FreeType requer arquivos de fonte carregados na memória WASM. Se o `loadFont` falhar (404 ou erro de parse), o shaping retorna 0 glyphs.
**Teste:** Verificar logs do console por "TextTool: font fetch failed" ou "TextTool: engine rejected font data".

### C) Render Loop Desincronizado
**Hipótese:** O loop de renderização (`TessellatedWasmLayer`) chama `rebuildTextQuadBuffer`, mas pode haver uma condição de corrida onde o engine não marca o buffer como "dirty" após `insertContent`, ou o renderizador ignora se o `textQuadMeta` estiver vazio inicialmente.

### D) Proxy de Input sem Foco
**Hipótese:** O `TextInputProxy` pode não estar recebendo eventos de teclado se o foco for roubado pelo Canvas ou outro elemento, embora `useEffect` tente focar.
**Teste:** Verificar logs `[DEBUG] TextInputProxy: handleInput` ao digitar.

---

## 2. Passo a Passo de Reprodução

1. Abrir a aplicação e selecionar a **Text Tool**.
2. Clicar no canvas (cria ponto de inserção).
   - *Observar:* Caret piscando aparece (confirmado pelo usuário).
3. Digitar "abc".
   - *Resultado Esperado:* Aparecer "abc" no canvas.
   - *Resultado Atual:* Nada aparece. Caret avança? (Não especificado, assumindo que nada visual muda).
4. Abrir Console do Desenvolvedor (F12).
   - Verificar logs adicionados pela instrumentação: `[DEBUG] TextTool: handleInputDelta`.
   - Verificar warnings de fonte.

---

## 3. Root Cause (Análise Estática)

A análise do código `frontend/features/editor/tools/TextTool.ts` revela que:
1. `createTextEntity` cria um run com `length: 0`.
2. `handleInputDelta` chama `bridge.insertContentByteIndex` que atualiza apenas o buffer de texto no engine.
3. Não há lógica em `TextTool` para recalcular ou estender os `runs` quando o texto cresce.

A menos que o Engine C++ atualize automaticamente o último run para incluir novo texto (comportamento atípico para engines de texto estilo "rich text" que exigem controle explícito de estilo), os novos caracteres ficam "sem estilo" e consequentemente não geram quads ou são renderizados invisíveis.

---

## 4. Patch Plan

### Correção Imediata (Fix Bug)
- **Modificar `TextTool.ts`:**
  - Em `handleInputDelta`, após inserir/remover texto, recalcular o comprimento do run (assumindo estilo único por enquanto) e chamar `bridge.upsertText` (ou uma nova função `bridge.updateRuns`) para atualizar os runs.
  - Alternativa simples: Em `createTextEntity`, inicializar com `length: 9999` (hack) ou garantir que a lógica de inserção expanda o run.

### Melhoria de Arquitetura
- Implementar gestão de runs robusta em `TextTool` para suportar múltiplos estilos no futuro.

---

## 5. Instrumentação Realizada

Foram adicionados logs (`console.log`) em pontos críticos:
- `frontend/components/TextInputProxy.tsx`: Entrada de dados do DOM.
- `frontend/features/editor/tools/TextTool.ts`: Recepção de deltas e cliques.
- `frontend/wasm/textBridge.ts`: Envio de comandos ao WASM.
- `frontend/src/components/TessellatedWasmLayer.tsx`: Loop de renderização (meta info), condicionado a `window.__dbgText`.

---

## 6. Plano de Implementação: Selection Box (Figma-style)

### Estrutura de Dados
- Atualizar `TextPayload` / Engine para suportar `boxMode` (já existe) e `constraintWidth`.
- `TextToolState` já possui `boxMode` e `constraintWidth`.

### Interações
1. **Drag-to-Create:**
   - Em `handleDrag` (já existente), definir `boxMode: FixedWidth` e calcular `constraintWidth`.
   - Renderizar feedback visual do box durante o drag (via `SelectionOverlay` ou `Draft` layer).

2. **Resize Handles:**
   - Quando um texto `FixedWidth` estiver selecionado (mas não editando), mostrar handles de redimensionamento (similar a `Rect`).
   - Ao arrastar handle: Atualizar `constraintWidth` via `bridge.upsertText`.

3. **Auto-Wrap (Engine):**
   - O Engine (HarfBuzz/C++) deve implementar quebra de linha baseada em `constraintWidth`.
   - O `TextTool` não precisa calcular quebra, apenas passar a largura.

### Estados
- **Editing:**
  - Double-click em texto existente -> `handleEditClick`.
  - Ler propriedades do engine (`bridge.getTextInfo` - precisa ser criado/exposto) para configurar o estado inicial (conteúdo, cursor, boxMode).

### Checklist de Implementação
- [ ] Expor `getTextInfo` (conteúdo, runs, boxMode) no Bridge.
- [ ] Implementar visualização do "Text Box" no `SelectionOverlay` (borda pontilhada quando selecionado).
- [ ] Adicionar lógica de Resize no `TextTool` ou ferramenta de Transformação.
