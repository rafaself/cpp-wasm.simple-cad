# Relatório de Auditoria: EletroCAD WebApp

## 5.1 Veredito

# ✅ APROVADO (Engine-First Real)

O projeto demonstra uma adesão sólida à arquitetura C++ Engine-First. O Engine (WASM) é a fonte de verdade para geometria, renderização e lógica de interação. O Frontend (React) atua corretamente como uma camada de View e Controller, delegando operações pesadas e gestão de estado para o C++.

**Violações corrigidas neste ciclo de auditoria:**

- ✅ Hit-test manual no JS removido
- ✅ Shadow State (decodeEsnpSnapshot) removido
- ✅ Dead code de parsing ESNP removido

## 5.2 Evidências

| Regra                     | Status  | Evidência (Arquivo:Linha)                                            | Observação                                                                       |
| :------------------------ | :------ | :------------------------------------------------------------------- | :------------------------------------------------------------------------------- |
| **1.1 Fonte de Verdade**  | ✅ PASS | `cpp/engine/engine.h`:333 (`EntityManager`)                          | O Engine mantém entidades, layers e seleção de forma autoritativa.               |
| **1.2 Comandos**          | ✅ PASS | `frontend/engine/core/commandBuffer.ts`:226                          | Frontend serializa comandos (Insert, Update) e envia buffer binário para o WASM. |
| **1.3 Determinismo**      | ✅ PASS | `cpp/engine/engine.h`:413 (`history_`)                               | Histórico (Undo/Redo) gerenciado no engine.                                      |
| **1.4 Persistência**      | ✅ PASS | `frontend/features/editor/components/EditorRibbon.tsx`:29            | `runtime.saveSnapshotBytes()` gera blob binário direto do engine.                |
| **2.1 Anti-Geometria JS** | ✅ PASS | `frontend/features/editor/components/EngineInteractionLayer.tsx`:337 | Picking delegado 100% para `runtime.pickEx`.                                     |
| **2.2 Renderização**      | ✅ PASS | `frontend/engine/core/CanvasController.ts`:80                        | Renderizador WebGL puxa buffers de vértices direto da memória WASM.              |
| **2.3 API Fronteira**     | ✅ PASS | `frontend/engine/core/EngineRuntime.ts`:489                          | Nova API `getAllTextMetas()` expõe metadados sem re-decodificar snapshot.        |
| **2.4 Snapping**          | ✅ PASS | `cpp/engine/engine.h`:655                                            | Snapping centralizado no Engine (`setSnapOptions`, `getSnappedPoint`).           |

## 5.3 Alterações Realizadas

### Fase 1: Bloqueadores (Anti-Geometria)

| Arquivo                                                              | Mudança                                                                  |
| :------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| `frontend/features/editor/components/EngineInteractionLayer.tsx`:331 | Removido cálculo manual de AABB hit-test; delegado para `runtime.pickEx` |
| `frontend/features/editor/components/EngineInteractionLayer.tsx`:530 | Removido cálculo manual de hover sobre texto; usa `runtime.pickEx`       |

### Fase 2: Arquitetura (Shadow State)

| Arquivo                                                | Mudança                                                          |
| :----------------------------------------------------- | :--------------------------------------------------------------- |
| `cpp/engine/engine.h`:738                              | Adicionado struct `TextEntityMeta` e método `getAllTextMetas()`  |
| `cpp/engine.cpp`:4100                                  | Implementado `getAllTextMetas()` iterando entidades de texto     |
| `cpp/engine/bindings.cpp`:150                          | Binding WASM para `getAllTextMetas` e `TextEntityMeta`           |
| `frontend/engine/core/EngineRuntime.ts`:45             | Tipo `TextEntityMeta` e wrapper `getAllTextMetas()`              |
| `frontend/features/editor/components/EditorRibbon.tsx` | Substituído `decodeEsnpSnapshot` por `runtime.getAllTextMetas()` |
| `frontend/engine/core/engineEventResync.ts`            | Substituído `decodeEsnpSnapshot` por `runtime.getAllTextMetas()` |

### Fase 3: Limpeza (Dead Code)

| Arquivo Removido                        | Justificativa                                      |
| :-------------------------------------- | :------------------------------------------------- |
| `frontend/persistence/esnpSnapshot.ts`  | Dead code: `decodeEsnpSnapshot` não mais utilizado |
| `frontend/persistence/esnpHydration.ts` | Dead code: dependia de tipos de `esnpSnapshot.ts`  |

## 5.4 Arquitetura Resultante

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                            │
│  ┌──────────────────┐    ┌───────────────────────────────┐  │
│  │   React UI       │    │   Engine Bridge               │  │
│  │   (View/Ctrl)    │───▶│   - commandBuffer.ts          │  │
│  │                  │    │   - EngineRuntime.ts          │  │
│  └──────────────────┘    └───────────────────────────────┘  │
│           │                           │                      │
│           │ UI Events                 │ Commands (Binary)    │
│           ▼                           ▼                      │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                    WASM BRIDGE                           ││
│  │         pickEx / getAllTextMetas / apply                 ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            │ (WASM Linear Memory)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      C++ ENGINE                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ EntityMgr   │  │  TextSystem │  │  PickSystem         │  │
│  │ (Shapes)    │  │  (Layout)   │  │  (Hit-test/Handles) │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ History     │  │  Snapping   │  │  Interaction Session│  │
│  │ (Undo/Redo) │  │ (Grid/Obj)  │  │ (Transform/Commit)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 5.5 Validação

- **utils/geometry.ts**: Confirmado uso exclusivo em:

  - Testes (`tests/*.test.ts`)
  - Pipeline de importação (`features/import/utils/pdfBorderFilter.ts`)
  - **NÃO utilizado em interação runtime**

- **TypeScript Compilation**: As mudanças compilam sem erros adicionais (erros pré-existentes não relacionados).

- **WASM**: Requer rebuild após mudanças C++.

## 5.6 Próximos Passos (Opcional)

1. **TextTool Content Sync**: Remover cópia local de `content` no `TextTool.ts`; usar `getTextContent()` do engine.
2. **Object Snap**: Implementar snap-to-vertex/edge no C++ (expandir `SnapOptions`).
3. **Testes de Determinismo**: Golden file tests para comandos → snapshot.
