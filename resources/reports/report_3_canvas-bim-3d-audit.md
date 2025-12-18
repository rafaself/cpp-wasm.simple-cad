# Relatório Técnico — Auditoria de Arquitetura (Canvas 2D → BIM/IFC + 3D)

**Data:** 2025-12-18  
**Escopo:** Frontend (engine 2D Canvas) + observações pontuais do backend  
**Premissa:** análise apenas (sem refatorações / mudanças de comportamento)

## 0) Sumário executivo

O projeto já tem uma base **funcional e relativamente madura** para CAD 2D: há separação visível entre **camada de estado** (Zustand), **renderização** (renderers Canvas2D) e **aceleração espacial** (QuadTree). Em termos de arquitetura, o estado do documento é **serializável** e existe um começo de “semântica elétrica” fora da geometria (via `ElectricalElement`).

Ao mesmo tempo, a escalabilidade para projetos “grandes” e a transição para BIM/3D encontram bloqueios estruturais claros:

- O “modelo” principal (`Shape`) é **um tipo único e genérico** que mistura geometria, estilo visual e alguns pontos de semântica, e ainda depende de `ToolType` (UI/tooling).
- A lógica de interação é um **God Hook** (`useCanvasInteraction.ts`) e o estado do documento é um **God Store** (`useDataStore.ts`). Isso aumenta custo de evolução e dificulta introduzir um pipeline 3D (scene graph/BVH, picking 3D, LOD).
- O pipeline atual é **2D-first**: não há eixo Z nem um “Building model” (levels/elevation/units) explícito; a noção de piso existe, mas é tratada como filtro, não como estrutura espacial 3D.

**Classificação geral:** **Arquitetura híbrida** (renderização relativamente isolada, mas domínio/estado e interação ainda muito acoplados e monolíticos).

---

## 1) Arquitetura e desacoplamento (Separation of Concerns)

### 1.1 Vazamento de lógica de render no modelo?

- **Não** há “chamadas diretas a `ctx` dentro dos modelos”. `Shape`, `ElectricalElement`, `ConnectionNode` e correlatos são estruturas de dados puras (ex.: `frontend/types/index.ts:141`).  
- A renderização está concentrada nos renderers (`frontend/features/editor/components/canvas/renderers/ShapeRenderer.ts`) e nos canvases (`StaticCanvas`, `DynamicOverlay`).

**Conclusão:** bom sinal para troca de backend de renderização (Canvas2D ↔ Pixi), desde que o “domínio geométrico” permaneça 2D.

### 1.2 “Estado” isolado o suficiente para trocar renderizador por Three.js/PixiJS?

**Parcialmente:**

- Para **PixiJS (2D)**: a migração é mais “mecânica” (reescrever `ShapeRenderer` + overlays) porque o estado e a geometria são 2D e já independem de Canvas API.
- Para **Three.js (3D)**: a troca não é plug-and-play. A maior parte do custo está em:
  - **picking/hit-test** (hoje é 2D: `isPointInShape`, bounds, handles, snapping),
  - **representação espacial** (QuadTree 2D → BVH/Octree 3D),
  - **modelo geométrico** (pontos 2D, sem Z).

**Evidências de acoplamento que “vazam” UI/tooling para o domínio:**

- `Shape.type` usa `ToolType` (mistura “tool” e “shape kind”): `frontend/types/index.ts:2` e `frontend/types/index.ts:141-146`.  
  Isso significa que adicionar uma ferramenta pode forçar mudanças no “modelo persistido”.

### 1.3 Onde o princípio de Dependency Inversion (DIP) é violado?

Principais violações observáveis:

1) **Domínio (Shape) depende de enumeração de UI (ToolType)**  
   - `frontend/types/index.ts:2` + `frontend/types/index.ts:141-146`.

2) **Store conhece detalhes de infraestrutura (QuadTree concreta) e expõe isso como parte do estado**  
   - `frontend/stores/useDataStore.ts:36-38` e instância global `initialQuadTree` em `frontend/stores/useDataStore.ts:9-11`.
   - Se amanhã a indexação virar BVH/Spatial Hash (ou Octree 3D), as ações do store hoje já assumem `insert/remove/update/query`.

3) **Interação + domínio + infraestrutura acoplados no “God Hook”**  
   - Ex.: `handleMouseMove` consulta `data.spatialIndex.query(...)` e dispara atualizações de shape no mesmo fluxo (`frontend/features/editor/interaction/useCanvasInteraction.ts:791+`), o que torna difícil trocar o mecanismo de “picking/snap”.

---

## 2) Pontos críticos (Red Flags) para BIM/IFC e 3D

### 2.1 Ausência de eixo Z / elevação (3D readiness)

- `Point` é estritamente 2D: `frontend/types/index.ts:94-97`.
- `Shape` carrega `floorId` e `discipline`, mas como **filtros 2D**; não há:
  - `Level` com `elevation`,
  - `placement` (local coordinate system),
  - unidade explícita e consistente (além de `worldScale`).

Impacto: um viewer 3D pode “inventar” um Z por piso, mas BIM/IFC exige um modelo explícito de níveis/placements para interoperar com previsibilidade.

### 2.2 Modelo genérico “Shape-kitchen-sink”

`Shape` concentra:

- geometria (`points`, `x/y/width/height`, `rotation`),
- estilo visual (stroke/fill/opacities/dash),
- conteúdo (texto),
- suporte a símbolo (SVG raw/viewbox/layers escondidas),
- ligações elétricas (`electricalElementId`, `connectionPoint`, nós de eletroduto),
- flags de diagrama (`diagramNodeId`, `diagramEdgeId`).

Evidência: `frontend/types/index.ts:141-217`.

Impacto: para BIM/IFC, “geometria” e “propriedades/atributos” precisam virar **entidades separadas** e mais tipadas (ex.: `IfcDistributionElement` vs `IfcWall`), com parâmetros de exportação e GUIDs estáveis.

### 2.3 Limite fixo do mundo no spatial index

- QuadTree inicial com bounds fixos: `frontend/stores/useDataStore.ts:9-11`.

Impacto: projetos grandes (ou coordenadas georreferenciadas) podem cair fora do “mundo” e simplesmente não serem indexados/renderizados/pickados. Para BIM, é comum trabalhar com coordenadas grandes e/ou origin shifting.

### 2.4 God Store / God Hook (evolução e testabilidade)

- `useDataStore` concentra documento + histórico + diagrama + elementos elétricos + conexões + layers: `frontend/stores/useDataStore.ts:20-90`.
- `useCanvasInteraction` concentra lógica de todas as ferramentas: `frontend/features/editor/interaction/useCanvasInteraction.ts` (ex.: `handleMouseMove` em `:791+` e `handleMouseUp` em `:1085+`).

Impacto: para evoluir rumo a BIM/3D, você precisará introduzir:

- pipeline de “comandos” (undo/redo por intent),
- entidades de domínio (ex.: eletroduto 3D com bends),
- mecanismos de seleção/snapping/picking extensíveis (2D/3D),

…e esses dois “centros” tendem a virar gargalos de complexidade e risco de regressão.

### 2.5 Tipagem frouxa em metadados elétricos

- `ElectricalElement.metadata` é `Record<string, string | number | boolean>` (ok como “escape hatch”), mas há fluxo com `any` no store:
  - `frontend/stores/useDataStore.ts:53` e implementação em `frontend/stores/useDataStore.ts:620-648`.

Impacto: para BIM/IFC, metadados precisam de **esquemas estáveis** (tipos/validação) para evitar export inconsistente.

---

## 3) Performance e algoritmos (Engine Core)

### 3.1 QuadTree está sendo usada corretamente para culling?

**Sim (em termos de intenção):**

- `StaticCanvas` calcula `viewRect` e consulta `spatialIndex.query(viewRect)` antes de renderizar: `frontend/features/editor/components/canvas/StaticCanvas.tsx:243-256`.
- A seleção por box também usa query espacial antes de fazer checks geométricos: `frontend/features/editor/interaction/useCanvasInteraction.ts:1130-1140`.
- Overlay de pontos de conexão também usa query: `frontend/features/editor/components/canvas/DynamicOverlay.tsx:225-238`.

Isso é o caminho certo para escalar visualização (evitar `O(N)` por frame).

### 3.2 Existem operações pesadas no “loop” (hot path)?

O app não tem um render loop contínuo (não vi `requestAnimationFrame` no core); o “hot path” é **mousemove / drag** + redraws reativos. Mesmo assim, há pontos de custo alto por evento:

- **Snapping a cada mousemove**:
  - query no spatial index + `getSnapPoint(...)`: `frontend/features/editor/interaction/useCanvasInteraction.ts:824-845`.
  - `computeFrameData(...)` dentro do mousemove: `frontend/features/editor/interaction/useCanvasInteraction.ts:837-844`.
- **Atualizações de shape durante drag** chamam `updateShape(...)`, que por sua vez executa `syncConnections()` e `syncDiagramEdgesGeometry()`:
  - `frontend/stores/useDataStore.ts:426-474` (chama `get().syncConnections()` e `get().syncDiagramEdgesGeometry()` em toda atualização).

Em desenhos grandes, esse “feedback loop” (mousemove → updateShape → sync global) tende a dominar a CPU e causar jitter.

### 3.3 Eficiência teórica da QuadTree implementada

Implementação: `frontend/utils/spatial.ts:4-150`.

- **Inserção**: média ~`O(log N)` (com subdivisão por capacidade), pior caso `O(N)` quando muitos shapes:
  - têm bounds muito grandes e permanecem em nós superiores,
  - ou se concentram numa área pequena (subdivisão profunda).
- **Consulta**: média `O(log N + k)` (k = shapes retornados), pior caso `O(N)`.
- **Custo oculto**: `getShapeBounds(shape)` é chamado em `insert`, `remove`, `query` e recalcula bounds (incluindo rotação/arcos) para cada shape tocado: `frontend/utils/spatial.ts:21-55` e `:98-118`.

Para 3D, o equivalente será BVH/Octree com “cached bounds” por entidade.

### 3.4 Suporte a LOD (Level of Detail)

Hoje não existe um “contrato” de LOD no modelo/renderers. Você até consegue adicionar LOD no render (ex.: não desenhar texto/símbolos abaixo de certo `viewTransform.scale`), mas faltam:

- representações simplificadas por entidade,
- regras de “importance” (ex.: dispositivos vs linhas),
- caching de geometria simplificada.

---

## 4) Preparação para BIM e 3D (Data Structures)

### 4.1 Extensibilidade para eixo Z

O caminho menos disruptivo seria **não mudar `Point` imediatamente**, e sim introduzir uma camada de “placements”:

- `Floor/Level` com `elevation` (m),
- cada `Shape` ainda 2D “no plano do piso”,
- viewer 3D faz extrusão/conversão via `(x, y, z=elevation)`.

Mas, para eletrodutos realistas em 3D (subidas/descidas), o modelo precisará suportar:

- polilinhas 3D (bends) ou segmentos com `z`,
- regras de roteamento (clearance, alturas, shafts),
- “ports/connectors” por elemento.

Hoje a topologia de eletroduto é 2D, com endpoints em nós (`fromNodeId/toNodeId`) e um `controlPoint` (Bezier 2D): `frontend/types/index.ts:198-203`.

### 4.2 Metadados separados da geometria?

**Parcialmente sim:**

- `ElectricalElement` existe separado de `Shape` e é referenciado por `electricalElementId`: `frontend/types/index.ts:79-92` e `:194-196`.

**Mas ainda há mistura:**

- `Shape` contém `svgRaw/svgViewBox` (representação visual) e `connectionPoint` (que é “semi-semântico”).
- Para IFC, vocês vão precisar de entidades próprias (com GUID, tipo IFC, propriedades) e a geometria precisa ser derivável de forma determinística.

---

## 5) Veredito da stack tecnológica (A/B/C)

### Cenário A — Manter Canvas2D para edição 2D e criar viewer 3D separado depois

**Recomendação: SIM (melhor custo/benefício agora).**

Motivos baseados no código atual:

- A engine já entrega funcionalidades críticas do MVP 2D (snap, seleção, layers, spatial index).
- O modelo e as ferramentas ainda são **muito 2D** e “tool-driven”; migrar isso para 3D unificado hoje vira reescrita ampla.
- Você pode criar um “pipeline de conversão” (2D → 3D) incremental e validar valor com usuários sem destruir o editor.

Passos práticos (sem impor refatoração agora, mas como norte):

1) Definir um **modelo de pisos/níveis** (elevations + unidades) e amarrar `floorId` a isso.
2) Definir um “**export schema**” (ex.: JSON estável) que separa:
   - geometria 2D,
   - propriedades elétricas,
   - mapeamento BIM (tipo IFC, GUID, propriedades).
3) Construir um viewer 3D que consome esse schema e gera meshes/instâncias.

### Cenário B — Refatorar agora para WebGL (Three.js/R3F) e unificar o código

**Recomendação: NÃO agora.**

Por quê:

- O custo não é “trocar o renderer”; é reescrever picking, snapping, handles, seleção, spatial index e possivelmente o modelo.
- O código atual tem hotspots no “mousemove/update” que já exigem disciplina de performance; 3D amplia o custo (draw calls, BVH, GPU resources).

Uma migração B faz sentido **depois** de:

- reduzir o acoplamento `ToolType` ↔ `Shape`,
- introduzir uma camada de “Tool/Command” extensível,
- definir um modelo com Z/placements.

### Cenário C — Introduzir C++/WASM agora

**Recomendação: NÃO.**

O que o código sugere é que os gargalos imediatos são:

- arquitetura (acoplamento e hot path de updates),
- estratégia de caching/pipelines,
- estrutura do modelo (2D vs 3D),

…e não um kernel matemático isolado que justifique WASM. WASM faz sentido mais tarde para:

- boolean ops robustas,
- tesselação complexa,
- IFC parsing/processing pesado,
- pathfinding/roteamento em larga escala,

…quando os requisitos estiverem claros e o JS já estiver bem organizado.

---

## 6) Script de verificação (opcional) — Stress test focado em QuadTree + bounds

Se você quiser um “stress test” *reprodutível* sem mexer no app, uma abordagem segura é criar um teste Vitest **marcado como `skip` por padrão** e executar manualmente quando necessário.

Sugestão (cole como `frontend/tests/quadtree_stress.skip.test.ts`):

```ts
import { describe, it } from 'vitest';
import { QuadTree } from '../utils/spatial';
import type { Shape } from '../types';

const makeLine = (id: string, x: number, y: number): Shape => ({
  id,
  layerId: 'desenho',
  type: 'line',
  points: [{ x, y }, { x: x + 10, y: y + 10 }],
  strokeColor: '#000',
  fillColor: '#fff',
});

describe.skip('stress/quadtree', () => {
  it('insert + query (manual)', () => {
    const N = 200_000;
    const qt = new QuadTree({ x: -100000, y: -100000, width: 200000, height: 200000 }, 8);

    const t0 = performance.now();
    for (let i = 0; i < N; i++) qt.insert(makeLine(`s-${i}`, (i % 2000) - 1000, (Math.floor(i / 2000) % 2000) - 1000));
    const t1 = performance.now();

    const view = { x: -500, y: -500, width: 1000, height: 1000 };
    const t2 = performance.now();
    const found = qt.query(view);
    const t3 = performance.now();

    // Observabilidade (sem asserts rígidos para evitar flakiness)
    console.log({ N, insertMs: t1 - t0, queryMs: t3 - t2, found: found.length });
  });
});
```

Execução manual:

- `cd frontend`
- `npx vitest run tests/quadtree_stress.skip.test.ts`

Observação: em Windows/OneDrive, toolchains podem ter problemas de permissão (EPERM) — se ocorrer, mover o repo para fora do OneDrive costuma resolver.

---

## 7) Arquivos analisados (núcleo)

- `frontend/types/index.ts`
- `frontend/stores/useDataStore.ts`
- `frontend/stores/useUIStore.ts`
- `frontend/utils/spatial.ts`
- `frontend/utils/geometry.ts`
- `frontend/utils/connections.ts`
- `frontend/features/editor/components/canvas/StaticCanvas.tsx`
- `frontend/features/editor/components/canvas/DynamicOverlay.tsx`
- `frontend/features/editor/components/canvas/renderers/ShapeRenderer.ts`
- `frontend/features/editor/interaction/useCanvasInteraction.ts`
- `backend/app/modules/engine/models/conduit.py` (observação pontual)

---

## 8) Change log (deste relatório)

- **Mudanças no código:** nenhuma
- **Entrega:** apenas este documento

