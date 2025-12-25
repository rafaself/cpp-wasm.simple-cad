# RELATÓRIO DE INVESTIGAÇÃO: Engine-First Picking

**Data:** 25/05/2024
**Agente:** Jules
**Fase:** 1 - Investigação Profunda (Picking Authority)

---

## 1. Executive Summary

A investigação confirmou que o projeto opera atualmente em um modelo de **Dupla Autoridade Espacial** ineficiente e propenso a inconsistências.

*   **Engine Picking (C++)**: Existe e suporta `Line`, `Polyline`, `Rect`, `Circle`. É puramente geométrico e ignora estado (visibilidade, lock).
*   **Dualidade**: O Frontend pergunta ao Engine quem foi clicado. Se o Engine retorna um objeto oculto, o Frontend descarta o resultado e cai para métodos lentos (GPU/JS) em vez de pedir o "próximo hit" ao Engine.
*   **Gargalo**: A falta de filtragem de estado (Visible/Locked) dentro do loop C++ impede que ele seja a autoridade final.
*   **Fallback JS**: `pickShapeAtGeometry` ainda é usado como fallback final, contendo lógica duplicada de hit-test para `Rect` e `Circle` (embora ignore corretamente `Line`/`Polyline`).
*   **Tolerância**: Já opera no modelo "Screen-Space Constant" (10px), convertida corretamente para World Units antes de chamar o Engine.
*   **Conclusão**: O caminho para "Engine-First" é claro e não exige reescrita do motor geométrico, mas sim a injeção de estado (State Awareness) no C++.

---

## 2. Fluxo Atual de Picking (AS-IS)

O fluxo de um clique (`click` event) segue estritamente este caminho hoje:

1.  **User Click**: `EngineInteractionLayer.tsx` captura o evento.
2.  **Engine Query**: Chama `runtime.engine.pick(worldX, worldY, toleranceWorld)`.
    *   *C++*: Itera shapes de cima para baixo (reverse draw order).
    *   *C++*: Retorna o primeiro ID geométrico encontrado.
3.  **Frontend Validation (Gargalo)**:
    *   Recebe ID. Busca Shape + Layer na Store JS.
    *   Verifica `visible` e `!locked`.
    *   **Se Válido**: Retorna ID (Fim).
    *   **Se Inválido** (ex: clicou em objeto oculto): **Descarta o hit do Engine**.
4.  **Fallback 1: GPU Picker**:
    *   Se Engine falhou ou foi invalidado, chama `gpuPicker.pick()`.
    *   Renderiza cena em offscreen buffer (1x1px).
    *   Lê pixel. Retorna ID.
5.  **Fallback 2: JS Geometry (`pickShapeAtGeometry`)**:
    *   Se GPU falhou, executa query espacial (QuadTree).
    *   Filtra visibilidade no loop JS.
    *   **Rect/Circle**: Testa matematicamente em JS.
    *   **Line/Polyline**: Pula (confia no Engine/GPU).

**Problema Crítico**: Se você tem um objeto visível *atrás* de um objeto oculto, o Engine retorna o oculto. O frontend rejeita. O sistema cai para GPU/JS para achar o visível. O Engine deveria ter ignorado o oculto e retornado o visível na primeira passada.

---

## 3. Tabela de Suporte do Engine (C++)

| Entidade | C++ `pick()` Suporta? | Algoritmo Atual | Estado (Visible/Lock) | Risco |
| :--- | :--- | :--- | :--- | :--- |
| **Line** | ✅ Sim | Point-Segment Dist | ⚠️ Verifica apenas `enabled` | Baixo |
| **Polyline** | ✅ Sim | Point-Segment (Iterativo) | ⚠️ Verifica apenas `enabled` | Baixo |
| **Rect** | ✅ Sim | AABB (Axis-Aligned) | ❌ Nenhum check | Médio |
| **Circle** | ✅ Sim | Radius Dist (Euclidiano) | ❌ Nenhum check | Médio |
| **Text** | ❌ Não | N/A | N/A | Alto (Hit via GPU/JS hoje) |
| **Polygon** | ❌ Não | N/A | N/A | Alto |
| **Arrow** | ❌ Não | N/A | N/A | Alto |

*Nota: `Text`, `Polygon` e `Arrow` dependem 100% dos fallbacks hoje.*

---

## 4. Análise de Tolerância

*   **Definição**: `HIT_TOLERANCE = 10` (pixels) em `constants.ts`.
*   **Cálculo**: `tolerance = HIT_TOLERANCE / viewTransform.scale`.
*   **Consistência**: O cálculo garante que a área de clique seja sempre de ~10px na tela, independente do zoom.
*   **Engine**: Recebe o valor em World Units.
*   **Avaliação**: O modelo atual está correto e alinhado com o "Gold Standard" de UX. Não requer mudanças.

---

## 5. Plano Técnico Proposto (TO-BE)

Para atingir **Engine-First Authority**, propõe-se a seguinte execução em 3 fases:

### Fase 1: Injeção de Estado no Engine (C++)
*   **Meta**: Permitir que o Engine saiba se uma entidade deve ser ignorada.
*   **Ação C++**:
    *   Adicionar campo `flags` (bitmask) nas structs `RectRec`, `CircleRec`, etc. (Bits: `VISIBLE=1`, `LOCKED=2`, `INTERACTABLE=4`).
    *   Atualizar `upsert*` commands para aceitar e armazenar essas flags.
    *   Alterar `pick()` para checar `if (!(flags & VISIBLE) || (flags & LOCKED)) continue;`.
*   **Ação Frontend**:
    *   Ao sincronizar shapes (`upsertShape`), passar o estado calculado de visibilidade/lock.
    *   Observar mudanças de Layer (Visible/Lock) e enviar updates em lote (delta updates) para o Engine.

### Fase 2: Expansão de Cobertura (C++)
*   **Meta**: Implementar `pick` para entidades faltantes.
*   **Ação**:
    *   Implementar `hitTestText` dentro de `pick` (já existe lógica no `TextLayout`).
    *   Implementar `Polygon` (similar a Circle ou Polyline dependendo da tesselação).
    *   Implementar `Arrow` (similar a Line/Polyline).

### Fase 3: Remoção de Fallbacks (Frontend)
*   **Meta**: Confiar cegamente no Engine.
*   **Ação**:
    *   Remover chamada ao `gpuPicker` para seleção simples.
    *   Simplificar `EngineInteractionLayer`: `id = engine.pick(); if (id) select(id);`.
    *   Eliminar validação pós-pick no frontend (pois o Engine já garantiu validade).

---

## 6. Checklist de Prontidão

*   [x] Sabemos onde implementar o filtro? **Sim** (`cpp/engine.cpp` -> `pick` loop).
*   [x] Sabemos como passar o dado? **Sim** (Expandir `upsert` commands ou criar command `SetEntityState`).
*   [x] Sabemos o que remover? **Sim** (Lógica de validação no `pickShape` e fallbacks progressivos).
*   [x] Sabemos onde quebra UX? **Sim** (Se a sincronia de estado falhar, o usuário não conseguirá selecionar objetos visíveis. A robustez do sync é vital).

---
**Fim do Relatório**
