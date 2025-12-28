# AGENTS.md — Source of Truth

**ESTE ARQUIVO É A ÚNICA FONTE DA VERDADE SOBRE A ARQUITETURA DO PROJETO.**
Instruções em outros arquivos que contradigam este documento devem ser ignoradas.

---

## 1. Visão e Objetivo

**Produto:** Editor CAD vetorial de alta performance com UX inspirada no Figma.

**Filosofia de Desenvolvimento:**

- **Qualidade > Velocidade de entrega.** Preferimos menos features, mas excelentes.
- **Performance é prioridade de design**, não otimização tardia.
- **UX premium é obrigatória** — o usuário deve ter uma experiência fluida e responsiva.

**Foco Atual:** Solidificar a base do CAD — ferramentas de desenho, seleção, transformação e edição de texto. O core deve ser genérico e extensível.

---

## 2. Arquitetura: **C++ Engine-First**

A arquitetura oficial é **Engine-First**. O Engine C++ (WASM) é a autoridade absoluta sobre os dados do documento.

### Princípios Fundamentais

| Regra                        | Descrição                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| **Engine = Source of Truth** | O Engine C++ detém o estado canônico de todas as entidades, geometria, seleção e histórico.     |
| **React = UI Only**          | React gerencia apenas: ferramenta ativa, preferências, viewport (zoom/pan), dialogs e toolbars. |
| **Fluxo Unidirecional**      | `User Input` → `React Event` → `Engine Command` → `Engine Update` → `Render`                    |
| **Proibido Shadow State**    | **NUNCA** mantenha cópias de dados do documento em stores React/Zustand.                        |

### Responsabilidades por Camada

| Camada            | Responsabilidade                                                                             | Localização                              |
| ----------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Engine C++**    | Entidades, geometria, seleção, undo/redo, picking, snapping, serialização, rendering buffers | `cpp/engine/`                            |
| **Bridge (WASM)** | Comunicação JS↔C++ via commands binários e event stream                                      | `frontend/engine/core/`                  |
| **React**         | Toolbars, dialogs, keyboard shortcuts, viewport state, tool selection                        | `frontend/stores/`, `frontend/features/` |
| **Renderer**      | WebGL2 tessellated rendering usando buffers do Engine                                        | `frontend/engine/renderer/`              |

### ⚠️ Anti-Patterns Críticos

| ❌ Não Faça                               | Por Que                                |
| ----------------------------------------- | -------------------------------------- |
| Manter lista de shapes no Zustand         | Duplicação de estado, dessincronização |
| Calcular bounding boxes no JS             | Inconsistência com Engine              |
| Armazenar content/caret de texto no React | Engine é a autoridade                  |
| Fazer transform math no JS                | Inconsistência numérica                |

---

## 3. Comunicação JS ↔ Engine

### Commands (JS → Engine)

```typescript
// Enviar comando para o Engine
runtime.apply([
  { op: CommandOp.UpsertRect, id: entityId, rect: { x, y, w, h, ... } }
]);
```

Comandos são **binários** e processados em batch. Ver `frontend/engine/core/commandBuffer.ts`.

### Events (Engine → JS)

```typescript
// Polling de eventos do Engine
const { events } = runtime.pollEvents(maxEvents);
// Tipos: DocChanged, EntityCreated, SelectionChanged, HistoryChanged, etc.
```

### Interactive Transform (Pattern Padrão)

```typescript
// Início de arraste
runtime.beginTransform(ids, mode, specificId, vertexIndex, startX, startY);

// Durante arraste (cada pointermove)
runtime.updateTransform(worldX, worldY);

// Fim do arraste
runtime.commitTransform(); // ou cancelTransform() com Escape
```

---

## 4. Estrutura de Pastas

```
cpp/
├── engine/
│   ├── engine.h           # API principal do CadEngine
│   ├── types.h            # Tipos POD compartilhados
│   ├── text/              # Sistema de texto (layout, atlas, fonts)
│   ├── pick_system.*      # Hit testing
│   ├── snapshot.*         # Serialização
│   └── entity_manager.*   # Gerenciamento de entidades

frontend/
├── engine/
│   ├── core/              # Runtime WASM, commands, protocols
│   ├── tools/             # TextTool e lógica de ferramentas
│   └── renderer/          # WebGL2 tessellated renderer
├── stores/
│   ├── useUIStore.ts      # Estado de UI (tool ativa, viewport, dialogs)
│   └── useSettingsStore.ts # Preferências e configurações
├── features/
│   └── editor/
│       ├── components/    # EngineInteractionLayer, Ribbon, etc.
│       └── hooks/         # useDraftHandler, useSelectInteraction
└── components/            # Componentes UI genéricos
```

---

## 5. Regras para Agentes

### Ao Criar/Modificar Features

1. **Pergunte:** "Este dado pertence ao documento?" Se sim → Engine.
2. **Para queries:** Use métodos do Engine (`pick`, `getEntityAabb`, `getTextContent`).
3. **Para modificações:** Envie commands, nunca modifique estado React.
4. **Transformações:** Use o padrão `begin/update/commit`.

### Performance

- **Zero-Allocation em hot paths:** `pointermove`, `drag`, render loops.
- **Batching:** Agrupe commands quando possível.
- **Evite re-renders:** Use seletores específicos no Zustand.

### C++ (Defensive Coding)

- Alterações em `cpp/` devem ser **modulares e defensivas**.
- Prefira criar novos métodos em vez de modificar existentes.
- Exponha via Embind em `bindings.cpp`.

---

## 6. Documentação Adicional

Para detalhes específicos, consulte:

| Documento                          | Conteúdo                 |
| ---------------------------------- | ------------------------ |
| `docs/agents/engine-api.md`        | API do Engine C++        |
| `docs/agents/frontend-patterns.md` | Padrões React permitidos |
| `docs/agents/text-system.md`       | Sistema de texto         |
| `docs/agents/workflows.md`         | Receitas práticas        |

---

## 7. Comandos de Desenvolvimento

```bash
# Build completo (Engine WASM + Frontend)
make fbuild

# Apenas frontend (dev mode)
cd frontend && pnpm dev

# Testes C++
cd cpp/build_native && ctest

# Testes Frontend
cd frontend && npx vitest run
```
