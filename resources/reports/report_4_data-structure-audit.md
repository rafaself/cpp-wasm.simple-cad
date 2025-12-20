# Relatório Técnico — Auditoria de Estrutura de Dados (Three.js + WASM Readiness)

**Data:** 2025-12-18  
**Papel:** Engenheiro de Sistemas Sênior (Games Architecture + BIM Software)  
**Escopo:** Types/Interfaces e Estado Global (Store) — **somente análise** (sem refatoração)  

## 1) Problema

Você está migrando de uma engine Canvas 2D para WebGL (Three.js), com plano futuro de mover o núcleo matemático para C++/WASM. O objetivo é validar se a **modelagem de dados atual** (Types + Store) é um impedimento e apontar **gaps que precisam ser corrigidos hoje** para reduzir custo/risco da migração.

## 2) Arquivos analisados (núcleo)

- `frontend/types/index.ts`
- `frontend/stores/useDataStore.ts`
- `frontend/stores/useUIStore.ts`

(apoio para evidência de uso estrutural)

- `frontend/utils/spatial.ts`
- `frontend/utils/connections.ts`

## 3) Diagnóstico (conclusão em uma frase)

O modelo atual é **serializável e ID‑based (bom para WASM)**, porém está **superconcentrado em uma entidade “kitchen‑sink” (`Shape`) e acoplado a conceitos de UI/tooling**, o que **não bloqueia**, mas **encarece muito** a migração para Three.js e inviabiliza um ABI “WASM‑ready” sem reestruturar Types/Interfaces.

## 4) Compatibilidade com C++/WASM (Memory Layout / Data-Oriented)

### 4.1 Serialização, referências e ciclos

**Pontos positivos**

- **Sem “object references” diretas no modelo persistido:** conexões e vínculos são por **IDs** (strings) — ex.: `electricalElementId`, `fromNodeId/toNodeId`, `diagramNodeId/diagramEdgeId`. (`frontend/types/index.ts:141`+)
- **Estruturas JSON‑friendly:** `Shape`, `ElectricalElement`, `ConnectionNode` são compostos majoritariamente por primitives/arrays/objetos simples.

**Riscos para WASM**

- **Layout instável e “optional soup”:** `Shape` tem dezenas de campos opcionais; em C++ isso vira uma struct com muitos estados inválidos e validações espalhadas (anti Data-Oriented). (`frontend/types/index.ts:141-217`)
- **Strings grandes no documento:** `svgRaw/svgOriginalRaw` dentro do shape aumenta custo de cópia/undo e dificulta mapear para buffers/handles no lado WASM. (`frontend/types/index.ts:186-193`)
- **Store armazena estrutura runtime (QuadTree) como parte do estado global:** isso deve ser explicitamente “derivado”, não parte do contrato de dados serializado/WASM. (`frontend/stores/useDataStore.ts:36-38`)

### 4.2 IDs string vs numéricos

- **Hoje:** IDs em string (ok para JSON e MVP).
- **Para WASM:** é altamente recomendável adotar **IDs numéricos internamente** (u32/u64) e manter string GUID somente na borda (import/export/migração). Isso reduz overhead de hashing, melhora locality e simplifica ABI.

## 5) BIM readiness (Semântica vs Visual)

### 5.1 Visual e engenharia estão desacoplados?

**Parcialmente:**

- Existe `ElectricalElement` separado de `Shape`, referenciado por `electricalElementId`. (`frontend/types/index.ts:79-92` e `frontend/types/index.ts:194-196`)

**Mas ainda há acoplamento forte:**

- `Shape` mistura geometria + estilo visual (`strokeColor`, `strokeWidth`, `fillColor`, fontes) + payload de render (SVG raw) + conectividade (conduit) + flags de diagrama. (`frontend/types/index.ts:141-217`)

**Implicação:** se o renderizador “sumir amanhã”, o modelo **ainda existe**, mas continua sendo “um desenho com atributos visuais” mais do que “um projeto elétrico” com propriedades de engenharia bem definidas e exportáveis para IFC.

## 6) Topologia e grafo (Conectividade)

### 6.1 Como está modelado hoje

- **Nós:** `ConnectionNode` com `kind: free|anchored`, `anchorShapeId`, `position` (cache/fallback). (`frontend/types/index.ts:37-54`)
- **Eletrodutos:** representam arestas via `Shape` do tipo `eletroduto/conduit`, com `fromNodeId/toNodeId` + legado `fromConnectionId/toConnectionId`. (`frontend/types/index.ts:198-207`)

### 6.2 Robustez e navegabilidade

**Robusto para MVP (correto por IDs), porém ineficiente para consultas:**

- Não há um índice explícito persistido para “node → edges” / “element → connections”.
- A navegação bidirecional tende a exigir varrer `shapes` (ou reconstruir índices em runtime). Isso é aceitável se:
  - o índice for construído uma vez e atualizado incrementalmente,
  - e não ficar no hot path de drag/hover.

## 7) Hierarquia e coordenadas (parenting / absolutos vs relativos)

### 7.1 Coordenadas

- `Point` é 2D (x,y) e os shapes parecem usar coordenadas absolutas de mundo; `ViewTransform` é câmera. (`frontend/types/index.ts:94-97`, `frontend/types/index.ts:219-223`)

### 7.2 Parenting / hospedagem (“tomada pertence à parede”)

- Não existe `parentId/hostId` ou modelo de containment/placement explícito.
- Para BIM, isso vira requisito cedo (hosted elements, levels/spaces, placements).

## 8) Análise da entidade principal (raio‑x)

### 8.1 `Shape` (principal risco arquitetural)

**Sintomas**

- União implícita (por `type`) com payload variável, mas sem discriminated union real.
- Mistura de conceitos de UI: `Shape.type` aponta para `ToolType`, que inclui ações (`move`, `rotate`, `pan`, `calibrate`) que não são “formas” persistidas. (`frontend/types/index.ts:2-19`, `frontend/types/index.ts:141-145`)
- Contém dados de biblioteca/render (`svgRaw`) que não são parte do domínio elétrico em si.

**Consequência**

- Para Three.js: você não só troca render, você precisa remodelar picking/snapping/handles; o tipo atual não ajuda a particionar responsabilidades.
- Para WASM: não existe “layout fixo” por categoria geométrica; isso força validação por if/else e impede buffers densos (SoA/AoS).

### 8.2 `ElectricalElement` (direção certa, mas precisa de schema)

**Hoje:** `metadata?: Record<string, string | number | boolean>` (`frontend/types/index.ts:90-91`)  
**Gap:** para BIM/IFC/export, o conjunto mínimo de propriedades deve ser versionado e tipado (ex.: `voltageV`, `currentA`, `powerW`, `materialCode`, etc.), mantendo `metadata` apenas como extensão controlada.

## 9) Gap Analysis — o que precisa mudar HOJE (Types/Interfaces)

Prioridade (ordem recomendada):

1) **Separar `ToolType` (UI) de `ShapeKind` (domínio/persistência)**  
   - `Shape.type` não pode depender de ferramentas.
2) **Trocar `Shape` por união discriminada (ou componentes) com payload mínimo por tipo**  
   - reduz opcionais e melhora validação/ABI.
3) **Remover `svgRaw/svgOriginalRaw` do documento serializado**  
   - manter apenas `symbolId` + overrides; SVG fica na biblioteca/assets.
4) **Introduzir “hierarquia/hosting”** (`parentId`, `hostId`, `attachment`)  
   - habilita “tomada em parede”, containment por ambiente, etc.
5) **Formalizar Levels/elevação e units**  
   - `floorId` hoje é etiqueta; BIM/3D precisa de `Level(elevation)`/placement.
6) **Modelar grafo explicitamente** (nodes/edges) e índices derivados  
   - “navegação bidirecional” sem varrer o mundo a cada consulta.
7) **Planejar IDs numéricos internos** + GUID externo (migração)  
   - prepara para WASM e performance.

## 10) Exemplo — `Shape` “WASM‑Ready” (direção alvo)

Exemplo conceitual (não é patch de código; é o alvo de design):

```ts
export type EntityId = number;
export type LayerId = number;
export type LevelId = number;

export enum ShapeKind {
  Line = 1,
  Polyline = 2,
  Rect = 3,
  Circle = 4,
  Text = 5,
  SymbolInstance = 6,
  ConduitEdge = 7,
}

export interface Transform2D {
  x: number; y: number;
  rotationRad: number;
  scaleX: number; scaleY: number;
}

export interface Style2D {
  strokeRgba: number;
  fillRgba: number;
  strokeWidth: number;
  dashPatternId?: number;
}

export type Geometry =
  | { kind: ShapeKind.Line; ax: number; ay: number; bx: number; by: number }
  | { kind: ShapeKind.Polyline; pointStart: number; pointCount: number }
  | { kind: ShapeKind.Rect; w: number; h: number }
  | { kind: ShapeKind.Circle; r: number }
  | { kind: ShapeKind.Text; textId: number; boxW: number; boxH: number }
  | { kind: ShapeKind.SymbolInstance; symbolId: number; boxW: number; boxH: number; port?: { u: number; v: number } }
  | { kind: ShapeKind.ConduitEdge; fromNode: EntityId; toNode: EntityId; control?: { x: number; y: number } };

export interface Entity2D {
  id: EntityId;
  levelId: LevelId;
  layerId: LayerId;
  parentId?: EntityId;

  transform: Transform2D;
  geom: Geometry;
  styleId: number;
  semanticId?: EntityId;
}
```

## 11) Risco e impacto (se você fizer essas mudanças)

- **Risco:** médio (migração de serialização + compatibilidade com projetos existentes).
- **Impacto positivo:** alto (reduz custo de migração para Three.js, habilita buffers/ABI WASM, melhora escalabilidade e BIM semantics).
- **Mitigação:** versionar `SerializedProject` e escrever migrators determinísticos (ex.: `v1 → v2`).

## 12) Verificação

- **Mudanças no código de produção:** nenhuma (apenas relatório).
- **Testes executados:** nenhum (não aplicável).

## 13) Arquivos alterados

- `resources/reports/report_4_data-structure-audit.md`

