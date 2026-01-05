# Fix Plan: Shape Creation Regression After Color Management

## Summary

This document outlines the step-by-step plan to fix the shape creation regression. The fix follows the principle of **smallest safe change** that restores shape creation while maintaining the engine-first architecture.

---

## Proposed Solution: Option A (Recommended)

**Approach**: Keep phantom entity in `drawOrderIds` and set up style overrides

This is the cleanest fix because:
1. Uses existing rendering infrastructure
2. Maintains style resolution consistency
3. Phantom entity renders like any other entity

### Implementation Steps

- [ ] **Step 1**: Remove code that removes phantom from `drawOrderIds`
  - **File**: `cpp/engine/interaction/interaction_draft.cpp`
  - **Lines**: 293-301
  - **Action**: Delete the loop that removes phantom from drawOrderIds

- [ ] **Step 2**: Set up style overrides when creating phantom entity
  - **File**: `cpp/engine/interaction/interaction_draft.cpp`
  - **Function**: `upsertPhantomEntity()`
  - **Action**: After each `entityManager_.upsert*()` call, also set up style overrides:
    ```cpp
    // After entityManager_.upsertRect(...):
    EntityStyleOverrides& overrides = entityManager_.ensureEntityStyleOverrides(phantomId);
    overrides.colorMask = EntityManager::styleTargetMask(StyleTarget::Stroke)
                        | EntityManager::styleTargetMask(StyleTarget::Fill);
    overrides.enabledMask = overrides.colorMask;
    overrides.fillEnabled = draft_.fillA > 0.5f ? 1.0f : 0.0f;
    ```

- [ ] **Step 3**: Ensure phantom renders on top (optional z-order handling)
  - **File**: `cpp/engine/interaction/interaction_draft.cpp`
  - **Function**: `upsertPhantomEntity()`
  - **Action**: After upserting, move phantom to end of `drawOrderIds`:
    ```cpp
    // Move to end of draw order (renders on top)
    auto& order = entityManager_.drawOrderIds;
    auto it = std::find(order.begin(), order.end(), phantomId);
    if (it != order.end()) {
        order.erase(it);
        order.push_back(phantomId);
    }
    ```

- [ ] **Step 4**: Clean up style overrides when removing phantom
  - **File**: `cpp/engine/interaction/interaction_draft.cpp`
  - **Function**: `removePhantomEntity()`
  - **Action**: Style overrides are already cleaned up by `deleteEntity()` (see entity_manager.cpp:237)

---

## Alternative Solution: Option B

**Approach**: Add separate phantom triangle rendering after main loop

This would require more changes but keeps phantom completely separate.

### Implementation Steps (Not Recommended)

- [ ] Add `appendDraftTriangleVertices()` function to InteractionSession
- [ ] Call it after main render loop in `rebuildRenderBuffers()`
- [ ] Handle style resolution manually for phantom

**Rejected because**: More code, duplicates rendering logic, harder to maintain.

---

## Files to Modify

| File | Changes |
|------|---------|
| `cpp/engine/interaction/interaction_draft.cpp` | Remove drawOrderIds removal, add style overrides setup |

---

## Acceptance Criteria

### Functional Requirements

| # | Criterion | Test |
|---|-----------|------|
| 1 | Line draft preview visible | Click and drag with line tool → see line preview |
| 2 | Rectangle draft preview visible | Click and drag with rect tool → see rectangle preview |
| 3 | Circle draft preview visible | Click and drag with circle tool → see circle preview |
| 4 | Polygon draft preview visible | Click and drag with polygon tool → see polygon preview |
| 5 | Polyline draft preview visible | Click-click with polyline tool → see segments |
| 6 | Arrow draft preview visible | Click and drag with arrow tool → see arrow preview |
| 7 | Draft uses correct colors | Colors match tool defaults (not layer defaults) |
| 8 | Text creation still works | Click with text tool → can create text |
| 9 | Committed shapes visible | After pointer up → shape persists |
| 10 | Undo/redo works | Create shape, undo → shape gone, redo → shape back |

### Non-Functional Requirements

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | No performance regression | Render loop timing unchanged |
| 2 | No memory leaks | Phantom cleanup verified |
| 3 | Engine-first maintained | No UI state duplication |

---

## Smoke Tests

### Manual Test Script

```
1. Open application
2. Select Rectangle tool
3. Click and drag on canvas
4. VERIFY: See rectangle preview during drag
5. Release mouse
6. VERIFY: Rectangle commits and is selected
7. VERIFY: Rectangle has correct colors (tool defaults)

Repeat for: Line, Circle, Polygon, Polyline, Arrow

8. Select Text tool
9. Click on canvas
10. Type "Hello"
11. VERIFY: Text appears

12. Select shape, Ctrl+Z
13. VERIFY: Shape disappears
14. Ctrl+Y
15. VERIFY: Shape reappears
```

### Unit Test (C++)

```cpp
// cpp/tests/draft_system_test.cpp
TEST(DraftSystemTest, PhantomEntityRendersWithCorrectColors) {
    CadEngine engine;
    BeginDraftPayload draft{};
    draft.kind = static_cast<uint32_t>(EntityKind::Rect);
    draft.x = 0; draft.y = 0;
    draft.fillR = 1.0f; draft.fillG = 0.0f; draft.fillB = 0.0f; draft.fillA = 1.0f;
    draft.strokeR = 0.0f; draft.strokeG = 1.0f; draft.strokeB = 0.0f; draft.strokeA = 1.0f;
    draft.strokeEnabled = 1.0f;

    engine.interactionSession().beginDraft(draft);
    engine.interactionSession().updateDraft(100, 100, 0);

    // Verify phantom entity exists and has style overrides
    const auto* overrides = engine.entityManager().getEntityStyleOverrides(DRAFT_ENTITY_ID);
    ASSERT_NE(overrides, nullptr);
    EXPECT_TRUE((overrides->colorMask & EntityManager::styleTargetMask(StyleTarget::Fill)) != 0);

    // Verify render includes phantom
    engine.rebuildRenderBuffers();
    EXPECT_GT(engine.getVertexCount(), 0);
}
```

### Integration Test (Frontend)

```typescript
// frontend/tests/interactions/DraftingHandler.test.ts
test('draft preview renders with correct colors', async () => {
  const runtime = await createTestRuntime();
  const handler = new DraftingHandler('rect', {
    strokeColor: '#FF0000',
    fillColor: '#00FF00',
    fillEnabled: true,
    strokeEnabled: true,
  });

  // Simulate pointer events
  handler.onPointerDown({ runtime, snappedPoint: { x: 0, y: 0 }, ... });
  handler.onPointerMove({ runtime, snappedPoint: { x: 100, y: 100 }, ... });

  // Verify render buffer has data
  const vertexCount = runtime.getVertexCount();
  expect(vertexCount).toBeGreaterThan(0);
});
```

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Style overrides memory leak | Low | Medium | `deleteEntity()` already cleans up overrides |
| Phantom rendered in wrong order | Medium | Low | Explicitly move to end of drawOrderIds |
| Performance impact | Low | Low | Single entity overhead is negligible |
| Snapshot includes phantom | Low | Medium | Snapshot code already filters DRAFT_ENTITY_ID |

---

## Rollback Plan

If the fix causes issues:

1. `git revert <fix-commit>`
2. Return to current state (broken shapes, working text)
3. Re-evaluate with Option B approach

---

## Implementation Notes

### Engine-First Boundary Compliance

This fix maintains engine-first boundaries:
- UI sends intents via BeginDraft/UpdateDraft/CommitDraft commands
- Engine owns geometry and state (phantom entity)
- Engine handles style resolution
- No duplicated UI state

### Style Override Semantics

The style overrides for phantom entity mean:
- `colorMask` bits set → use entity's actual colors (stored in RectRec etc.)
- `enabledMask` bits set → use entity's enabled flags
- `resolveStyle()` will return the entity's colors instead of layer defaults

This matches how committed entities work after `initShapeStyleOverrides()`.
