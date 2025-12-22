# Plano de PRs (Pull Requests)

## PR 1: Instrumentação e Logs (Já realizado)
- Adiciona logs em `TextInputProxy`, `TextTool`, `TextBridge` e `TessellatedWasmLayer`.
- Objetivo: Confirmar fluxo de eventos e diagnóstico em produção/staging.

## PR 2: Fix Text Rendering (Runs Update)
- **Escopo:** `frontend/features/editor/tools/TextTool.ts`
- **Mudança:**
  - Atualizar `handleInputDelta` para recalcular o comprimento do `run` baseado no novo conteúdo.
  - Usar `bridge.upsertText` em vez de `insertContent` para garantir que os metadados de estilo (runs) cubram todo o texto.
- **Teste:** Digitar texto e verificar se renderiza imediatamente.

## PR 3: Seleção e Resize Box (Text Box)
- **Escopo:** `TextTool.ts`, `SelectionOverlay`, `EditorSidebar`
- **Etapas:**
  1. Implementar renderização do bounding box de texto (já deve vir do engine `getTextQuadBufferMeta` ou similar, mas precisa de bounds explícitos para seleção).
  2. Adicionar handles de resize para textos com `boxMode: FixedWidth`.
  3. Integrar resize com atualização de `constraintWidth` no engine.

## PR 4: Refinamento de UX
- **Escopo:** `TextInputProxy`, `TextCaretOverlay`
- **Mudança:**
  - Melhorar posicionamento do `TextInputProxy` para suporte a IME (CJK/Mobile) usando coordenadas de tela corretas.
  - Ajustar visual do Caret e Seleção para coincidir perfeitamente com métricas da fonte.
  - Ocultar handles de seleção enquanto edita.
