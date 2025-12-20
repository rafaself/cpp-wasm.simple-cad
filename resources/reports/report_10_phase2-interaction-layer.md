# Phase 2 – Interaction Layer Investigation & Fixes

## Problema observado

- A UI voltou a carregar, porém a área de desenho “não aceitava” interação (desenhar/selecionar/pan/zoom).
- Após iniciar a migração para o pipeline WASM/WebGL, o **Canvas2D (`DynamicOverlay`) deixou de ser o receptor de eventos**, e parte das ferramentas passou a ficar sem handler.
- Além disso, algumas ferramentas do Ribbon (principalmente **`eletroduto`** e **`electrical-symbol`**) não tinham implementação no novo `EngineInteractionLayer`, e mesmo quando shapes eram criadas no Zustand, **o espelho do engine WASM ignorava esses tipos** (logo “não aparecia nada” no render).

## Diagnóstico (causas raiz prováveis)

1) **Problema de stacking / hit‑testing**
   - `CadViewer` (WebGL) ficava em um wrapper absoluto que podia interceptar pointer events (mesmo sem handlers), impedindo o overlay interativo de receber eventos.

2) **Falta de suporte de ferramentas no novo overlay**
   - O novo overlay implementava só `select/pan/line/rect/polyline` (subconjunto).
   - O menu expõe ferramentas adicionais: `eletroduto`, `electrical-symbol`, etc. Ao selecionar essas ferramentas, o usuário via “nada acontece”.

3) **Espelho TS → WASM ignorava tipos elétricos**
   - `useEngineStoreSync` espelhava apenas `rect/line/polyline`.
   - Shapes do tipo `eletroduto/conduit/arrow` eram tratados como “unsupported” e removidos do engine mirror (ou nunca enviados).

## Correções aplicadas (Fase 2 – incremento)

### 1) Garantir que o overlay receba eventos

- `frontend/src/components/EngineInteractionLayer.tsx`
  - Adicionado `zIndex` explícito no overlay (`zIndex: 20`) para garantir que esteja acima do WebGL.
- `frontend/src/components/NextSurface.tsx`
  - Adicionado `pointer-events-none` no wrapper do `CadViewer` quando `embedded`, evitando que ele capture eventos por cima do overlay.

### 2) Adicionar ferramentas mínimas essenciais (elétrico)

- `frontend/src/components/EngineInteractionLayer.tsx`
  - Implementado suporte a:
    - **`electrical-symbol`**: clique posiciona o símbolo (shape `rect` com metadados e `ElectricalElement`).
    - **`eletroduto/conduit`**: criação em 2 cliques, com tentativa de ancorar em connection points (quando possível) e fallback para nós livres.
  - Preview do eletroduto via SVG overlay (`draft.kind === 'conduit'`).
  - Ajuste de preview: stroke width do SVG agora é em pixels (não escala com zoom).

### 3) Fazer o engine mirror aceitar `eletroduto/conduit/arrow`

- `frontend/engine/runtime/useEngineStoreSync.ts`
  - `eletroduto`/`conduit` passam a ser espelhados como **polyline**.
  - `arrow` passa a ser espelhado como **line** (render simples; sem ponta ainda).

## Arquivos alterados

- `frontend/src/components/EngineInteractionLayer.tsx`
- `frontend/src/components/NextSurface.tsx`
- `frontend/engine/runtime/useEngineStoreSync.ts`

## Riscos / impactos

- Baixo/médio:
  - As ferramentas novas ainda são **parciais** e focadas em “voltar a permitir interação”.
  - `electrical-symbol` ainda renderiza no WASM como retângulo (engine atual não renderiza SVG/texto).
  - `arrow` renderiza apenas a linha.

## Verificação (local)

1) Build:
   - `cd frontend && npm run build`

2) Dev server (ambiente local):
   - `cd frontend && npm run dev`
   - Se precisar rebuild do WASM após C++:
     - `cd frontend && npm run build:wasm`

3) Checklist manual no app:
   - `Pan` (tool ou alt/mouse2/middle).
   - `Zoom` com wheel.
   - `Linha/Retângulo/Polilinha` desenham e aparecem no render WebGL.
   - `Lançamento > Eletroduto`: 2 cliques cria um eletroduto visível.
   - `Lançamento > Tomada/Lâmpada`: clique cria símbolo (por enquanto como bounding rect no render).

## O que ainda falta (Phase 2 “de verdade”)

- Paridade de ferramentas:
  - `move/rotate`, `text`, `circle/polygon/arc/measure`, seleção por caixa, snapping completo.
- Render de símbolos e texto no pipeline novo:
  - migrar para **atlas + instancing** (decidido), removendo dependências de SVG/canvas.
- Remover TS store como “source of truth” do documento:
  - ferramentas e edição no WASM (JS → comandos), TS store vira view‑model/UI.

