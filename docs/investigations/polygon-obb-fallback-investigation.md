# Investigação: Polygon OBB Fallback Bug

**Data:** 2026-01-24
**Branch:** `feat/shapes-cad-like`
**Status:** ✅ Causa Raiz Identificada

---

## 📌 Resumo Executivo

Entidades do tipo `EntityKind.Polygon` continuam utilizando seleção baseada em OBB (Oriented Bounding Box, 4 cantos) em vez de exibir overlay CAD-like baseado no contorno real e grips nos vértices.

**Causa Raiz:** Mismatch entre os valores dos enums `EntityKind` (C++) e `PickEntityKind` (C++). A função `getEntityKind()` retorna valores de `PickEntityKind`, mas o TypeScript espera valores de `EntityKind`.

---

## 🔍 Diagnóstico Detalhado

### Análise dos Valores dos Enums

| Entity Type | `EntityKind` (C++ types.h) | `PickEntityKind` (C++ pick_system.h) | `EntityKind` (TS types.ts) |
|-------------|---------------------------|-------------------------------------|---------------------------|
| Rect        | **1** | **1** | **1** |
| Line        | **2** | **3** | **2** |
| Polyline    | **3** | **4** | **3** |
| Circle      | **7** | **2** | **7** |
| **Polygon** | **8** | **5** | **8** |
| Arrow       | **9** | **6** | **9** |

### O Bug

A função `CadEngine::getEntityKind()` (arquivo `engine.cpp`, linhas 464-479) retorna valores de `PickEntityKind`, **não** de `EntityKind`:

```cpp
// engine.cpp:464-479
std::uint32_t CadEngine::getEntityKind(std::uint32_t entityId) const {
    auto it = state().entityManager_.entities.find(entityId);
    if (it != state().entityManager_.entities.end()) {
        switch (it->second.kind) {
            case EntityKind::Rect: return static_cast<std::uint32_t>(PickEntityKind::Rect);
            case EntityKind::Line: return static_cast<std::uint32_t>(PickEntityKind::Line);
            case EntityKind::Polyline: return static_cast<std::uint32_t>(PickEntityKind::Polyline);
            case EntityKind::Circle: return static_cast<std::uint32_t>(PickEntityKind::Circle);
            case EntityKind::Polygon: return static_cast<std::uint32_t>(PickEntityKind::Polygon); // Returns 5!
            case EntityKind::Arrow: return static_cast<std::uint32_t>(PickEntityKind::Arrow);
            case EntityKind::Text: return static_cast<std::uint32_t>(PickEntityKind::Text);
            default: return static_cast<std::uint32_t>(PickEntityKind::Unknown);
        }
    }
    return 0;
}
```

Mas o TypeScript espera valores de `EntityKind`:

```typescript
// ShapeOverlay.tsx:321-327
const entityKind = runtime.getEntityKind(entityId); // Returns 5 (PickEntityKind::Polygon)
const isVertexOnly =
  entityKind === EntityKind.Line ||      // 2 === 3? NO (Line: EntityKind=2, PickEntityKind=3)
  entityKind === EntityKind.Arrow ||     // ...
  entityKind === EntityKind.Polyline ||  // ...
  entityKind === EntityKind.Polygon;     // 5 === 8? NO! (Polygon: PickEntityKind=5, EntityKind=8)
```

**Resultado:** A comparação `5 !== 8` falha, então Polygon **nunca** entra no branch `isVertexOnly`, e cai no fallback para OBB/AABB.

---

## 📊 Verificação por Camada

### Engine (C++)

| Componente | Arquivo | Status | Observação |
|------------|---------|--------|------------|
| `getSelectionOutlineMeta()` | `engine_overlay.cpp:109-130` | ✅ OK | Retorna N vértices reais para Polygon |
| `getSelectionHandleMeta()` | `engine_overlay.cpp:234-255` | ✅ OK | Retorna N grips de vértices |
| `getOrientedHandleMeta()` | `engine_overlay.cpp:384-387` | ✅ OK | Retorna `valid=0` para Polygon |
| `getEntityKind()` | `engine.cpp:464-479` | ❌ **BUG** | Retorna `PickEntityKind` em vez de `EntityKind` |

### Bindings e Runtime (TypeScript)

| Componente | Arquivo | Status | Observação |
|------------|---------|--------|------------|
| `SelectionSystem` | `SelectionSystem.ts` | ✅ OK | Decodificação correta |
| `getPolygonContourMeta()` | `SelectionSystem.ts:174-182` | ✅ OK | Fallback funcional |
| `getEntityGripsWCS()` | `SelectionSystem.ts:193-204` | ✅ OK | Decodifica grips corretamente |
| `overlayDecoder` | `overlayDecoder.ts` | ✅ OK | Decodifica buffer corretamente |
| `gripDecoder` | `gripDecoder.ts` | ✅ OK | Decodifica grips corretamente |

### Frontend (React)

| Componente | Arquivo | Status | Observação |
|------------|---------|--------|------------|
| `ShapeOverlay` (decision) | `ShapeOverlay.tsx:322-327` | ✅ OK (lógica) | Polygon está na lista `isVertexOnly` |
| `ShapeOverlay` (overlay) | `ShapeOverlay.tsx:383-387` | ✅ OK | Chama `getPolygonContourMeta()` |
| `ShapeOverlay` (grips) | `ShapeOverlay.tsx:407-408` | ✅ OK | Chama `getEntityGripsWCS()` |

### Types

| Componente | Arquivo | Status | Observação |
|------------|---------|--------|------------|
| `EntityKind` (C++) | `types.h:247` | ✅ OK | Valores corretos |
| `PickEntityKind` (C++) | `pick_system.h:38-47` | ✅ OK | Valores diferentes (por design) |
| `EntityKind` (TS) | `types.ts` | ⚠️ Mismatch | Espera `EntityKind`, recebe `PickEntityKind` |

---

## 🛠 Plano de Correção

### Opção A: Corrigir `getEntityKind()` no C++ (Recomendado)

**Impacto:** Baixo
**Risco:** Baixo
**Esforço:** ~5 minutos

Alterar a função para retornar `EntityKind` em vez de `PickEntityKind`:

```cpp
// engine.cpp linha 464-479
std::uint32_t CadEngine::getEntityKind(std::uint32_t entityId) const {
    auto it = state().entityManager_.entities.find(entityId);
    if (it != state().entityManager_.entities.end()) {
        return static_cast<std::uint32_t>(it->second.kind); // Return EntityKind directly
    }
    return 0;
}
```

**Prós:**
- Correção simples e direta
- Mantém consistência com o TypeScript
- Não afeta persistência/snapshots

**Contras:**
- Pode quebrar código que depende de `PickEntityKind` (verificar)

### Opção B: Atualizar os valores de `EntityKind` no TypeScript

**Impacto:** Alto
**Risco:** Alto
**Esforço:** ~2 horas

Sincronizar os valores do TypeScript com `PickEntityKind`:

```typescript
// apps/web/engine/types.ts
export enum EntityKind {
  Unknown = 0,
  Rect = 1,
  Circle = 2,   // Changed from 7
  Line = 3,     // Changed from 2
  Polyline = 4, // Changed from 3
  Polygon = 5,  // Changed from 8
  Arrow = 6,    // Changed from 9
  Text = 7,
}
```

**Prós:**
- Alinha com o que a engine realmente retorna

**Contras:**
- Pode quebrar persistência e snapshots existentes
- Requer atualização em múltiplos arquivos
- Maior risco de regressão

### Opção C: Criar novo enum `PickEntityKind` no TypeScript

**Impacto:** Médio
**Risco:** Baixo
**Esforço:** ~30 minutos

Criar um enum separado no TypeScript que espelha `PickEntityKind` do C++ e usar esse enum em `ShapeOverlay.tsx`.

```typescript
// apps/web/engine/types.ts
export enum PickEntityKind {
  Unknown = 0,
  Rect = 1,
  Circle = 2,
  Line = 3,
  Polyline = 4,
  Polygon = 5,
  Arrow = 6,
  Text = 7,
}
```

**Prós:**
- Não altera comportamento existente
- Explicita a diferença entre os enums

**Contras:**
- Adiciona complexidade (dois enums para o mesmo conceito)
- Requer cuidado para usar o enum correto em cada contexto

---

## ✅ Recomendação

**Implementar Opção A** - Corrigir `getEntityKind()` para retornar `EntityKind` diretamente.

Esta é a correção mais simples e de menor risco, pois:
1. O TypeScript já espera valores de `EntityKind`
2. A lógica de overlay/grips já está implementada corretamente
3. Não afeta persistência ou snapshots
4. Mantém consistência semântica (retorna o tipo da entidade, não o tipo de pick)

---

## 🧪 Testes de Validação

Após a correção, validar:

1. **Seleção única de polígonos** (3 a 12 lados):
   - Contorno deve seguir os vértices reais
   - Grips devem aparecer em cada vértice
   - Não deve haver fallback para 4 cantos (OBB)

2. **Multi-seleção de polígonos**:
   - Deve usar AABB (comportamento esperado)

3. **Rotação de polígonos**:
   - Vértices devem estar rotacionados corretamente
   - Grips devem acompanhar os vértices

4. **Outros tipos de entidade**:
   - Rect: OBB com 4 cantos + resize handles
   - Circle: OBB com 4 cantos + resize handles
   - Line/Arrow/Polyline: Vertex-based (2 endpoints)

5. **Testes existentes**:
   - `overlay_query_test.cpp` deve continuar passando
   - Testes de integração de seleção

---

## 📁 Arquivos Relevantes

- `packages/engine/engine.cpp:464-479` - **BUG: getEntityKind()**
- `packages/engine/engine/core/types.h:247` - EntityKind enum (C++)
- `packages/engine/engine/interaction/pick_system.h:38-47` - PickEntityKind enum (C++)
- `apps/web/engine/types.ts` - EntityKind enum (TypeScript)
- `apps/web/features/editor/components/ShapeOverlay.tsx:321-327` - Decisão de overlay
- `apps/web/engine/core/runtime/SelectionSystem.ts` - Bindings de seleção
- `packages/engine/engine/impl/engine_overlay.cpp` - Implementação de overlay

---

## 📝 Histórico

| Data | Ação |
|------|------|
| 2026-01-24 | Investigação inicial e identificação da causa raiz |
