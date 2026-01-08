import { useMemo, useCallback } from 'react';

import { normalizeAngle } from '@/utils/geometry/angleNormalization';

import { useDocumentSignal } from './engineDocumentSignals';
import { useEngineRuntime } from './useEngineRuntime';

import type { EntityId, EntityTransform } from './protocol';

/**
 * Hook to get the current transform data for an entity.
 * Returns null when no entity is provided or entity doesn't exist.
 * Re-reads when geometry signal changes (during drag/resize/rotate).
 *
 * IMPORTANT: This hook always returns the latest engine value. To prevent
 * engine updates from overwriting user input while editing, use local draft
 * state in your component. See example below.
 *
 * @example
 * ```tsx
 * const MyInspector = ({ entityId }) => {
 *   const transform = useEntityTransform(entityId);
 *   const [draft, setDraft] = useState<string | null>(null);
 *   const isEditing = useRef(false);
 *
 *   // Sync from engine only when not editing
 *   useEffect(() => {
 *     if (!isEditing.current && transform) {
 *       setDraft(null); // Clear draft, use engine value
 *     }
 *   }, [transform]);
 *
 *   const displayValue = draft ?? transform?.posX.toFixed(2) ?? '';
 *
 *   return (
 *     <input
 *       value={displayValue}
 *       onFocus={() => { isEditing.current = true; }}
 *       onChange={(e) => setDraft(e.target.value)}
 *       onBlur={() => {
 *         isEditing.current = false;
 *         // Commit draft to engine
 *       }}
 *     />
 *   );
 * };
 * ```
 *
 * @param entityId Entity ID to query, or null/undefined
 * @returns EntityTransform data or null
 */
export const useEntityTransform = (entityId: EntityId | null | undefined): EntityTransform | null => {
  const runtime = useEngineRuntime();
  const geometryGeneration = useDocumentSignal('geometry');

  return useMemo(() => {
    void geometryGeneration; // Dependency for re-computation
    if (!runtime || !entityId) return null;

    const transform = runtime.getEntityTransform(entityId);
    if (!transform.valid) return null;

    return transform;
  }, [runtime, entityId, geometryGeneration]);
};

/**
 * Hook that returns mutation functions for entity transforms.
 * These functions create history entries for undo/redo.
 *
 * @returns Object with mutation functions
 */
export const useSetEntityTransform = () => {
  const runtime = useEngineRuntime();

  const setPosition = useCallback(
    (entityId: EntityId, x: number, y: number) => {
      if (!runtime) return;
      runtime.setEntityPosition(entityId, x, y);
    },
    [runtime],
  );

  const setSize = useCallback(
    (entityId: EntityId, width: number, height: number) => {
      if (!runtime) return;
      runtime.setEntitySize(entityId, width, height);
    },
    [runtime],
  );

  const setRotation = useCallback(
    (entityId: EntityId, rotationDeg: number) => {
      if (!runtime) return;
      // Normalize to -180..180 range before sending to engine (Figma convention)
      const normalized = normalizeAngle(rotationDeg);
      runtime.setEntityRotation(entityId, normalized);
    },
    [runtime],
  );

  const setLength = useCallback(
    (entityId: EntityId, length: number) => {
      if (!runtime) return;
      runtime.setEntityLength(entityId, length);
    },
    [runtime],
  );

  return useMemo(
    () => ({
      setPosition,
      setSize,
      setRotation,
      setLength,
    }),
    [setPosition, setSize, setRotation, setLength],
  );
};
