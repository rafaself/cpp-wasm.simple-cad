import { describe, it, expect, beforeEach } from "vitest";
import { useDataStore, __resetDataStoreForTests } from "../stores/useDataStore";
import { Shape } from "../types";

describe("useDataStore undo/redo determinism", () => {
  beforeEach(() => {
    __resetDataStoreForTests();
  });

  const baseShape: Shape = {
    id: "s1",
    layerId: "desenho",
    type: "rect",
    x: 0,
    y: 0,
    width: 10,
    height: 5,
    strokeColor: "#000000",
    fillColor: "#ffffff",
    points: [],
  };

  it("applies add -> update -> delete and roundtrips with undo/redo", () => {
    const store = useDataStore.getState();

    store.addShape(baseShape);
    store.updateShape(baseShape.id, { x: 5, y: 5 });
    store.deleteShape(baseShape.id);

    // undo delete
    store.undo();
    let s = useDataStore.getState().shapes[baseShape.id];
    expect(s).toBeTruthy();
    expect(s?.x).toBe(5);
    expect(s?.y).toBe(5);

    // undo update
    store.undo();
    s = useDataStore.getState().shapes[baseShape.id];
    expect(s?.x).toBe(0);
    expect(s?.y).toBe(0);

    // undo add -> removed
    store.undo();
    expect(useDataStore.getState().shapes[baseShape.id]).toBeUndefined();

    // redo add
    store.redo();
    s = useDataStore.getState().shapes[baseShape.id];
    expect(s).toBeTruthy();
    expect(s?.x).toBe(0);

    // redo update
    store.redo();
    s = useDataStore.getState().shapes[baseShape.id];
    expect(s?.x).toBe(5);
    expect(s?.y).toBe(5);

    // redo delete
    store.redo();
    expect(useDataStore.getState().shapes[baseShape.id]).toBeUndefined();
  });
});
