import type { EngineRuntime } from './EngineRuntime';
import { getShapeId } from './IdRegistry';
import type { EntityId } from './protocol';
import { useDataStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';

const arraysEqual = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export const syncSelectionFromEngine = (runtime: EngineRuntime): Set<EntityId> => {
  const ids = runtime.getSelectionIds();
  const next = new Set<EntityId>(ids);
  useUIStore.setState({ selectedEntityIds: next });
  return next;
};

export const syncDrawOrderFromEngine = (runtime: EngineRuntime): string[] => {
  const data = useDataStore.getState();
  const ids = runtime.getDrawOrderSnapshot();
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    const shapeId = getShapeId(id);
    if (!shapeId) continue;
    if (!data.shapes[shapeId]) continue;
    ordered.push(shapeId);
    seen.add(shapeId);
  }

  const remaining = data.shapeOrder.filter((id) => !seen.has(id) && !!data.shapes[id]);
  const nextOrder = ordered.concat(remaining);

  if (!arraysEqual(data.shapeOrder, nextOrder)) {
    useDataStore.setState({ shapeOrder: nextOrder });
  }

  return nextOrder;
};
