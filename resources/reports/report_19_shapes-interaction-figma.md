# Report 19 — Shapes: criação/manipulação estilo Figma (Next engine)

## Problem
- No modo atual (`next` / `EngineInteractionLayer` + WASM), apenas `rect/line/polyline/eletroduto` têm criação e/ou manipulação completa; os demais itens do Ribbon/shortcuts ficam parcialmente inoperantes, e há bugs de seleção, resize, opacidade e lifecycle de ferramentas.

## Investigation (evidence + root causes)

### 1) Linha: seleção quadrada + sem resize
- Evidência: `frontend/src/components/EngineInteractionLayer.tsx` renderiza `selectedOverlaySvg` com handles **apenas** para `shape.type === 'rect'`; o fallback para outros tipos é bbox axis-aligned e **sem handles**.
- Evidência: `pickResizeHandleAtScreen(...)` ignora tudo que não seja `rect` (retorna `null` para linha).
- Consequência: linha aparece com “seleção quadrada” e não existe caminho de interação para mover endpoints (resize).

### 2) Circle/Arc/Polygon/Arrow: não cria
- Evidência: `frontend/config/menu.ts` e `frontend/config/keybindings.ts` expõem ferramentas `circle/arc/polygon/arrow`, mas `frontend/src/components/EngineInteractionLayer.tsx` só implementa criação para `line/rect/polyline/eletroduto` (e `electrical-symbol`/`text`).
- Consequência: Ribbon/atalhos permitem selecionar ferramentas sem implementação.

### 3) Opacidade: stroke vira preto; fill some quando <100%
- Evidência: `frontend/components/ColorPicker/index.tsx` emite `rgba(r,g,b,a)` quando `a < 1`.
- Evidência: o espelho TS→WASM (`frontend/engine/runtime/useEngineStoreSync.ts`) converte cor via `hexToRgb` de `frontend/utils/color.ts`, que **só aceita** `#RRGGBB`/`#RGB` (não aceita `rgba(...)` nem `#RRGGBBAA`).
- Consequência direta:
  - `strokeColor`/`fillColor` recebendo `rgba(...)` (ex.: via `StyleProperties.tsx` e `LayerManagerModal.tsx`) => `hexToRgb` retorna `null` => stroke cai no fallback `{0,0,0}` (preto) e fill vira `fillA=0` (invisível).
- Observação importante: hoje o renderer WASM/Three usa `vertexColors` com **RGB only** (buffers têm 6 floats por vértice) em `frontend/src/components/CadViewer.tsx` e `cpp/engine/render.cpp`. Portanto:
  - Mesmo após corrigir o bug “preto/transparente”, **opacidade real por shape** (stroke/fill) ainda não existe para linhas/polylines/rects sem evoluir o pipeline para carregar alpha por vértice (ou shader custom).

### 4) Polilinha “continua” ao selecionar ferramenta de novo
- Evidência: `EngineInteractionLayer` mantém `draft` local; ao trocar `activeTool`, o `useEffect([activeTool])` limpa apenas `selectionBox`/`selectInteractionRef` e cursor, **não** zera `draft`.
- Consequência: ao voltar para `polyline`, o estado anterior permanece e o usuário “continua” a criação anterior.

### 5) Resize geral: sem flip + não respeita `proportionsLinked`
- Evidência: lógica de resize atual (somente `rect`) impõe sinais esperados (`expectedSignX/Y`) e `Math.max(1e-3, ...)`, o que impede flip.
- Evidência: não há leitura de `shape.proportionsLinked` (setável via UI em `frontend/features/editor/components/properties/DimensionProperties.tsx`).

## Plan (proposed, requires explicit approval before implementation)

### A) Corrigir bug de cores/opacity que vira preto/transparente (mínimo, sem mudar comportamento além do bug)
1. Normalizar saída do `ColorPicker` quando o target for **cores de shapes/layers**:
   - Ao receber `rgba(...)`, converter para `#RRGGBB`.
   - Para shapes: mapear `a` → `strokeOpacity`/`fillOpacity` (0–100) sem gravar `rgba` no modelo.
   - Para layers: gravar apenas `#RRGGBB` e ignorar alpha (camadas não têm opacidade hoje).
2. Inicializar `ColorPicker` para shapes com alpha coerente:
   - Passar `rgba(...)` ao abrir o picker, derivado de `fillOpacity/strokeOpacity`, para não “perder” a alpha ao mexer só na cor.

Arquivos prováveis:
- `frontend/features/editor/components/properties/StyleProperties.tsx`
- `frontend/features/editor/components/LayerManagerModal.tsx`
- (helper) `frontend/utils/color.ts` (ou novo util em `frontend/utils/` para parse/normalize sem depender de componentes)

### B) Implementar criação de shapes faltantes no `EngineInteractionLayer`
1. `arrow`: criar shape `type: 'arrow'` (pontos como linha).
2. `circle` (UI como “Elipse”): criar shape `type: 'circle'` com `x/y` (centro) e `width/height` (elipse); com `Shift` => `width==height`.
3. `polygon`: criar shape `type: 'polygon'` com centro + parâmetros mínimos (ex.: `sides`, `radius` e/ou `width/height`/`scaleX/scaleY`).
4. `arc`: remover da UI (menu + atalhos) conforme solicitado; manter o tipo no modelo para compatibilidade de import/legado.

Arquivos prováveis:
- `frontend/src/components/EngineInteractionLayer.tsx`
- `frontend/config/menu.ts`
- `frontend/config/keybindings.ts`
- `frontend/features/editor/hooks/useKeyboardShortcuts.ts` (para não entrar em tool inexistente)

### C) Polilinha: confirmar/cancelar como Figma
1. Confirmar com `Enter` e com botão direito (context menu) dentro da área de desenho.
2. `Esc` descarta a polilinha atual.
3. Ao trocar de ferramenta, descartar o `draft` de polilinha.

Arquivos prováveis:
- `frontend/src/components/EngineInteractionLayer.tsx`

### D) Seleção + resize: Figma-like
1. Linhas: exibir 2 handles nas extremidades e permitir arrastar endpoints (resize) e arrastar o segmento (move).
2. Shapes não-line: exibir bbox com handles e permitir resize horizontal/vertical.
3. Resize respeita `proportionsLinked` quando `true`.
4. Resize permite flip (cruzar o “eixo” do corner oposto) mantendo o corner fixo.

Arquivos prováveis:
- `frontend/src/components/EngineInteractionLayer.tsx`
- `frontend/utils/geometry.ts` (apenas se necessário para handles/cursors de linha/shape)

### E) Opacidade real no renderer “next” (para cumprir o comportamento esperado)
Implementar alpha por vértice (ou shader equivalente) para que `fillOpacity/strokeOpacity` sejam visíveis no WASM/Three:
- Alterar buffers de render para incluir alpha (stride 7 ou 8 floats) e atualizar materiais para ler alpha via `ShaderMaterial`/`onBeforeCompile`.
- Atualizar command buffer (`UpsertRect`, `UpsertLine`, `UpsertPolyline`, `UpsertConduit`) para transportar alpha, mantendo compatibilidade de snapshot se necessário.

Arquivos prováveis:
- `cpp/engine/render.cpp`, `cpp/engine/types.h`, `cpp/engine.cpp` (payload/commands)
- `frontend/src/components/CadViewer.tsx` (bind de atributos + material)
- `frontend/engine/runtime/commandBuffer.ts`, `frontend/engine/runtime/useEngineStoreSync.ts`

## What I will change
- Ajustar **somente** os fluxos ligados a criação/manipulação de shapes, seleção/resize, e normalização de cores/opacidade para não quebrar o pipeline TS→WASM.
- Implementar ferramentas faltantes no `EngineInteractionLayer` e alinhar teclado/menu para não expor tool sem suporte.
- Adicionar suporte de opacidade real no renderer `next` se for aprovado como requisito obrigatório nesta entrega.

## What I will not change
- Não farei refactors amplos nem mudanças de arquitetura fora do escopo.
- Não alterarei formato de serialização persistida de shapes sem plano de migração; qualquer extensão será compatível e limitada ao necessário.
- Não mexerei em ferramentas não citadas (ex.: snapping avançado, rotate/multi-edit) a menos que sejam bloqueadores diretos.

## Risk (assessment + mitigations)
- **Medium/High** se incluir o item E (alpha no WASM/Three): mexe em buffers/ABI WASM e exige rebuild de artefatos; mitigação: implementar incrementalmente (primeiro parsing/normalização de cores, depois alpha em branch de buffer com versioning/feature flag).
- **Medium** para mudanças em seleção/resize: pode impactar interação existente de `rect`; mitigação: manter paths antigos para `rect`, adicionar testes unitários de helpers e smoke test manual guiado.
- **Low/Medium** para ajustes de menu/atalhos: mitigação: garantir que `useKeyboardShortcuts` não selecione tools desabilitados.

## Verification (commands)
- Unit tests (frontend): `cd frontend && npx vitest run`
- Manual (smoke) em modo next:
  - Criar `Rect`, redimensionar, flip, respeitar `proportionsLinked`.
  - Criar `Line`, selecionar, mover segmento, mover endpoints.
  - Criar `Polyline`, finalizar com `Enter` e botão direito; cancelar com `Esc` e ao trocar ferramenta.
  - Ajustar cor e opacidade de stroke/fill (garantir que não vira preto/transparente e que alpha é visível se o item E for implementado).

## Open questions (need clarification before proceeding)
1. “Elipse”: podemos manter `ToolType`/`ShapeType` como `'circle'` (compatibilidade) e apenas renomear no UI, usando `width/height` para elipse?  
2. “Polígono”: precisa suportar resize não-uniforme (stretch) ou manter regular (uniform)? Isso define se usamos `scaleX/scaleY`/`width/height` vs `radius` apenas.  
3. “Seta”: precisa de arrowhead visual já nesta entrega, ou uma seta pode ser renderizada como linha por enquanto (WASM só tem `line`/`polyline` hoje)?  
4. Opacidade: o alpha do `ColorPicker` deve controlar `strokeOpacity/fillOpacity` do shape (0–100) e **não** ser persistido na string da cor — confirmando que essa é a UX desejada.

