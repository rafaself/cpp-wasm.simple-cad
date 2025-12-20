# Execução (Guideline: `resources/reports/report_9_next-only-execution-plan.md`) — Fases 3–6

## Estado atual (pré-execução)

- O editor já estava “Next-only” no runtime (sem Canvas2D na UI), com:
  - render base via **WASM + R3F/WebGL** (`CadViewer`)
  - interação via overlay HTML (`EngineInteractionLayer`)
  - documento ainda em **Zustand** (`useDataStore`) com espelhamento para o WASM (`useEngineStoreSync`) para primitivas (rect/line/polyline).
- Problemas para avançar:
  - `text` não tinha editor/UX (o overlay antigo de Canvas2D foi removido).
  - símbolos elétricos ainda eram “placeholder rect” (e/ou dependiam de renderer Canvas2D antigo).
  - não existia um **formato Next** de persistência (snapshot + log) integrado ao fluxo `Novo/Abrir/Salvar`.

## Objetivo das fases 3–6 (neste incremento)

- **Fase 3 (Texto):** reintroduzir texto com UX mínima completa (editar e formatação básica) e renderização performática.
- **Fase 4 (Símbolos):** renderização performática de símbolos via atlas/instancing (sem SVG/Canvas2D no hot path de render).
- **Fase 6 (Persistência):** salvar/abrir com “snapshot + log” no caminho Next.

> Nota de escopo: **Fase 5 (elétrico completo no engine WASM)** ainda não foi migrada para o C++/WASM neste incremento. As ferramentas elétricas operam no TS store e são renderizadas no WebGL via instancing. O próximo incremento precisa mover nodes/edges + snapping/regras para o WASM para fechar a Fase 5 conforme o guideline.

---

## Implementação realizada

### Fase 3 — Texto (MSDF/SDF + instancing + UX)

**Entrega de UX (edição):**
- `frontend/src/components/TextEditorOverlay.tsx`
  - overlay HTML `<textarea>` posicionado em world coords
  - commit em blur/CTRL+Enter; ESC cancela
  - cria shape `type: 'text'` com `x,y` bottom-left (convertendo do clique/topo visual)
  - integra com defaults do ribbon (fontFamily/fontSize/align/bold/italic/underline/strike)
- `frontend/src/components/EngineInteractionLayer.tsx`
  - `tool === 'text'` agora abre o editor no clique

**Entrega de render:**
- `frontend/src/next/textSdf/fontAtlas.ts`
  - geração on-demand de **atlas SDF** (single-channel) para ASCII básico (32–126)
  - cache por (fontFamily, bold, italic)
- `frontend/src/components/TextSdfLayer.tsx`
  - renderização em WebGL via **InstancedBufferGeometry + ShaderMaterial**
  - suporta `fontSize` e `align` (left/center/right), `bold/italic` (atlas por estilo)

**Limitações conhecidas desta Fase 3 (planejado no guideline):**
- O atlas é **SDF (1 canal)** neste incremento; MSDF “real” fica como evolução (mesma arquitetura).
- Métricas de fonte ainda não são determinísticas cross-machine (usa stack de fontes do sistema).

### Fase 4 — Símbolos (atlas/instancing)

- `frontend/src/components/SymbolAtlasLayer.tsx`
  - gera um atlas runtime dos SVGs da library elétrica (`canvasSvg`)
  - renderiza símbolos via instancing (quad + uvRect por instância)
  - respeita `rotation` e `scaleX/scaleY`

**Remoção do placeholder:**
- `frontend/engine/runtime/useEngineStoreSync.ts`
  - `rect` com `svgSymbolId/svgRaw` deixa de ser espelhado para o WASM (para não desenhar o retângulo por baixo do símbolo).

### Seleção/feedback visual (necessário para UX)

- `frontend/src/components/CadViewer.tsx`
  - `SelectionOverlay` passou a desenhar o highlight a partir do `useDataStore` (não depende do snapshot do WASM).
  - isso garante seleção consistente para entidades que não são espelhadas para o engine (ex.: símbolos renderizados via atlas).

### Fase 6 — Persistência (snapshot + log)

**Formato de arquivo Next (`.ewnd`):**
- `frontend/persistence/nextDocumentFile.ts`
  - container binário simples com header `"EWND"` + versão + 3 blobs JSON:
    - meta (worldScale + frame)
    - snapshot (SerializedProject)
    - log (history: past/future)

**Integração no Ribbon (File > Novo/Abrir/Salvar):**
- `frontend/features/editor/components/EditorRibbon.tsx`
  - implementados `new-file`, `open-file`, `save-file` usando o formato `.ewnd`
- `frontend/stores/useDataStore.ts`
  - adicionados `resetDocument()` e `loadSerializedProject(...)` para restore determinístico e rebuild do spatial index

---

## Arquivos adicionados

- `frontend/src/components/TextEditorOverlay.tsx`
- `frontend/src/components/TextSdfLayer.tsx`
- `frontend/src/components/SymbolAtlasLayer.tsx`
- `frontend/src/next/textSdf/fontAtlas.ts`
- `frontend/persistence/nextDocumentFile.ts`

## Arquivos alterados

- `frontend/src/components/EngineInteractionLayer.tsx`
- `frontend/src/components/CadViewer.tsx`
- `frontend/engine/runtime/useEngineStoreSync.ts`
- `frontend/stores/useDataStore.ts`
- `frontend/features/editor/components/EditorRibbon.tsx`

---

## Riscos / trade-offs (importantes)

- **Determinismo de texto:** sem um font asset embutido, render/layout depende do ambiente.
- **Carga inicial:** atlas de símbolos + atlas de fontes são gerados no client (pode dar “stutter” na primeira carga).
- **Persistência:** `.ewnd` é binário, mas os blobs internos são JSON (rápido de implementar; pode evoluir para binário real depois).

---

## Verificação

Build:
- `cd frontend && npm run build`

Testes:
- `cd frontend && npm test`
  - Observação: há 1 falha preexistente em `frontend/tests/undoRedo.spec.ts` (não introduzida por esta execução).

Manual (no app):
- File > `Salvar` gera `eletrocad-next.ewnd`
- File > `Abrir` restaura shapes + layers + history
- Texto: tool `Texto`, clique para editar, alterar tamanho/alinhamento/bold/italic no ribbon
- Símbolos: tool `Tomada/Lâmpada` renderiza via atlas (sem retângulo placeholder)

---

## Próximo incremento (para cumprir Fase 5 e fechar Fase 6 “de verdade”)

1) **Fase 5 (WASM):** mover nodes/edges + snapping/regras de conduits para o engine (JS só envia input/commands).
2) **Fase 6 (WASM):** persistir snapshot+command log diretamente do documento do engine (sem depender do TS store).
3) **Texto:** trocar SDF→MSDF, embutir fontes (assets) para determinismo, e mover layout/shaping crítico para WASM quando necessário.

