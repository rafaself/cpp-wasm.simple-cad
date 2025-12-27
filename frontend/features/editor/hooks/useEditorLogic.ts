import { useDataStore } from '../../../stores/useDataStore';
import { useUIStore } from '../../../stores/useUIStore';
import { getCombinedBounds, getDistance, getShapeCenter, rotatePoint, getShapeBoundingBox } from '../../../utils/geometry';
import { Shape, Point } from '../../../types';
import { computeFrameData } from '../../../utils/frame';
import { UI } from '../../../design/tokens';
import { getEngineId, getShapeId as getShapeIdFromRegistry, registerEngineId, releaseId } from '@/engine/core/IdRegistry';
import { CommandOp } from '@/engine/core/commandBuffer';
import { EngineLayerFlags, LayerPropMask, SelectionMode, type EntityId } from '@/engine/core/protocol';
import { getEngineRuntime } from '@/engine/core/singleton';
import { syncSelectionFromEngine } from '@/engine/core/engineStateSync';
import { shapeToEngineCommand } from '@/engine/core/useEngineStoreSync';
import { ensureLayerEngineId, getLayerEngineId } from '@/engine/core/LayerRegistry';
import { deleteTextByShapeId } from '@/engine/core/textEngineSync';

export const useEditorLogic = () => {
    const dataStore = useDataStore();
    const uiStore = useUIStore();

    const ensureEngineLayer = (runtime: Awaited<ReturnType<typeof getEngineRuntime>>, layerId: string) => {
        const layer = dataStore.layers.find((l) => l.id === layerId) ?? null;
        const engineLayerId = ensureLayerEngineId(layerId);
        if (runtime.engine.setLayerProps) {
            const flags =
                (layer?.visible ? EngineLayerFlags.Visible : 0) |
                (layer?.locked ? EngineLayerFlags.Locked : 0);
            runtime.engine.setLayerProps(
                engineLayerId,
                LayerPropMask.Name | LayerPropMask.Visible | LayerPropMask.Locked,
                flags,
                layer?.name ?? 'Layer'
            );
        }
        return engineLayerId;
    };

    const buildCreateCommand = (runtime: Awaited<ReturnType<typeof getEngineRuntime>>, shape: Shape) => {
        const engineId = runtime.allocateEntityId();
        const shapeId = `entity-${engineId}`;
        registerEngineId(engineId, shapeId);

        const nextShape = { ...shape, id: shapeId };
        const layer = dataStore.layers.find((l) => l.id === nextShape.layerId) ?? null;
        const cmd = shapeToEngineCommand(nextShape, layer, () => engineId);
        if (!cmd) return null;

        return { shape: nextShape, engineId, cmd };
    };

    const deleteSelected = () => {
        const selectedIds = Array.from(uiStore.selectedEntityIds);
        if (selectedIds.length === 0) return;

        const deletions = selectedIds.map((entityId) => {
            const shapeId = getShapeIdFromRegistry(entityId);
            const shape = shapeId ? dataStore.shapes[shapeId] : null;
            return { entityId, shapeId, shape };
        });

        const shapeIds = deletions
            .map((entry) => entry.shapeId)
            .filter((id): id is string => !!id);
        if (shapeIds.length > 0) {
            dataStore.deleteShapes(shapeIds);
        }

        void getEngineRuntime().then((runtime) => {
            const commands: { op: CommandOp; id: EntityId }[] = [];
            for (const entry of deletions) {
                if (entry.shapeId && entry.shape?.type === 'text') {
                    const deleted = deleteTextByShapeId(entry.shapeId);
                    if (!deleted) {
                        commands.push({ op: CommandOp.DeleteText, id: entry.entityId });
                        releaseId(entry.shapeId);
                    }
                } else {
                    commands.push({ op: CommandOp.DeleteEntity, id: entry.entityId });
                    if (entry.shapeId) releaseId(entry.shapeId);
                }
            }

            if (commands.length > 0) {
                runtime.apply(commands);
            }
            runtime.clearSelection();
            syncSelectionFromEngine(runtime);
        });
    };

    const deleteLayer = (id: string) => {
        // We need to know which shapes will be deleted to update selection
        const shapesToDelete: string[] = [];
        Object.values(dataStore.shapes).forEach(s => {
            if (s.layerId === id) shapesToDelete.push(s.id);
        });
        const deletionEntries = shapesToDelete.map((shapeId) => ({
            shapeId,
            shape: dataStore.shapes[shapeId],
            entityId: getEngineId(shapeId),
        }));
        const entityIdsToDelete = new Set(
            deletionEntries
                .map((entry) => entry.entityId)
                .filter((entityId): entityId is EntityId => entityId !== null)
        );

        // Perform deletion in DataStore
        const success = dataStore.deleteLayer(id);

        if (success) {
            const remaining = Array.from(uiStore.selectedEntityIds).filter((entityId) => !entityIdsToDelete.has(entityId));
            void getEngineRuntime().then((runtime) => {
                const commands: { op: CommandOp; id: EntityId }[] = [];
                for (const entry of deletionEntries) {
                    const { shapeId, shape, entityId } = entry;
                    if (entityId === null) continue;
                    if (shape?.type === 'text') {
                        const deleted = deleteTextByShapeId(shapeId);
                        if (!deleted) {
                            commands.push({ op: CommandOp.DeleteText, id: entityId });
                            releaseId(shapeId);
                        }
                    } else {
                        commands.push({ op: CommandOp.DeleteEntity, id: entityId });
                        releaseId(shapeId);
                    }
                }
                if (commands.length > 0) {
                    runtime.apply(commands);
                }
                const engineLayerId = getLayerEngineId(id);
                if (engineLayerId !== null) {
                    runtime.engine.deleteLayer?.(engineLayerId);
                }
                runtime.setSelection(remaining, SelectionMode.Replace);
                syncSelectionFromEngine(runtime);
            });
        }
    };

    const zoomToFit = () => {
        const currentData = useDataStore.getState();
        const currentUI = useUIStore.getState();
        
        const frameData = computeFrameData(currentData.frame, currentData.worldScale);
        const activeFloorId = currentUI.activeFloorId || 'terreo';
        
        const allShapes = [
            ...(Object.values(currentData.shapes) as Shape[]).filter(s => (s.floorId || 'terreo') === activeFloorId),
            ...(frameData ? frameData.shapes : []),
        ];
        const { canvasSize } = currentUI;

        if (canvasSize.width <= 0 || canvasSize.height <= 0) return;

        if (allShapes.length === 0) {
            currentUI.setViewTransform({
                x: canvasSize.width / 2,
                y: canvasSize.height / 2,
                scale: 1
            });
            return;
        }

        const bounds = getCombinedBounds(allShapes);
        if (!bounds) return;

        const padding = 50;
        const availableW = canvasSize.width - padding * 2;
        const availableH = canvasSize.height - padding * 2;
        const scale = Math.min(availableW / bounds.width, availableH / bounds.height, UI.MAX_ZOOM);
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const newX = (canvasSize.width / 2) - (centerX * scale);
        const newY = (canvasSize.height / 2) + (centerY * scale);

        currentUI.setViewTransform({ x: newX, y: newY, scale });
    };

    const joinSelected = () => {
        const ids = Array.from(uiStore.selectedEntityIds)
            .map((id) => getShapeIdFromRegistry(id))
            .filter((id): id is string => !!id);
        const candidates = ids.map(id => dataStore.shapes[id]).filter(s => s && (s.type === 'line' || s.type === 'polyline'));
        if (candidates.length < 2) return;

        const baseShape = candidates[0];
        let mergedPoints = [...baseShape.points];
        const tolerance = 10;
        const processedIds = new Set([baseShape.id]);

        let changed = true;
        while(changed) {
            changed = false;
            for (let i = 0; i < candidates.length; i++) {
                const current = candidates[i];
                if (processedIds.has(current.id)) continue;

                const currentPoints = current.points;
                if (!currentPoints || currentPoints.length < 2) continue;

                const startP = currentPoints[0];
                const endP = currentPoints[currentPoints.length - 1];

                const chainStart = mergedPoints[0];
                const chainEnd = mergedPoints[mergedPoints.length - 1];

                const distStartStart = getDistance(startP, chainStart); // Using imported getDistance
                const distStartEnd = getDistance(startP, chainEnd);
                const distEndStart = getDistance(endP, chainStart);
                const distEndEnd = getDistance(endP, chainEnd);

                if (distStartEnd < tolerance) {
                    mergedPoints = [...mergedPoints, ...currentPoints.slice(1)];
                    processedIds.add(current.id); changed = true;
                } else if (distEndStart < tolerance) {
                    mergedPoints = [...currentPoints.slice(0, -1), ...mergedPoints];
                    processedIds.add(current.id); changed = true;
                } else if (distStartStart < tolerance) {
                    const reversed = [...currentPoints].reverse();
                    mergedPoints = [...reversed.slice(0, -1), ...mergedPoints];
                    processedIds.add(current.id); changed = true;
                } else if (distEndEnd < tolerance) {
                    const reversed = [...currentPoints].reverse();
                    mergedPoints = [...mergedPoints, ...reversed.slice(1)];
                    processedIds.add(current.id); changed = true;
                }
            }
        }

        if (processedIds.size > 1) {
            const newPolyline: Shape = {
                ...baseShape,
                id: 'pending',
                type: 'polyline',
                points: mergedPoints
            };

            const idsToDelete = Array.from(processedIds);
            const deleteEntries = idsToDelete.map((shapeId) => ({
                shapeId,
                entityId: getEngineId(shapeId),
            }));

            void getEngineRuntime().then((runtime) => {
                const created = buildCreateCommand(runtime, newPolyline);
                if (!created) return;

                const commands: { op: CommandOp; id: EntityId }[] = [];
                for (const entry of deleteEntries) {
                    if (entry.entityId === null) continue;
                    commands.push({ op: CommandOp.DeleteEntity, id: entry.entityId });
                }
                runtime.apply([created.cmd, ...commands]);

                const engineLayerId = ensureEngineLayer(runtime, created.shape.layerId);
                runtime.engine.setEntityLayer?.(created.engineId, engineLayerId);

                dataStore.deleteShapes(idsToDelete);
                dataStore.addShape(created.shape);
                idsToDelete.forEach((shapeId) => releaseId(shapeId));

                runtime.setSelection([created.engineId], SelectionMode.Replace);
                syncSelectionFromEngine(runtime);
            });
        }
    };

    const explodeSelected = () => {
        const ids = Array.from(uiStore.selectedEntityIds)
            .map((id) => getShapeIdFromRegistry(id))
            .filter((id): id is string => !!id);
        if (ids.length === 0) return;

        const newShapes: Shape[] = [];
        const idsToDelete: string[] = [];

        ids.forEach(id => {
            const shape = dataStore.shapes[id];
            if (!shape) return;

            if (shape.type === 'polyline' && shape.points && shape.points.length > 1) {
                // Explode Polyline into Lines
                // If the polyline is rotated, we need to bake the rotation into the new line segments
                // so they are "global" lines with rotation: 0.
                const center = shape.rotation ? getShapeCenter(shape) : { x: 0, y: 0 }; // Pivot center

                for (let i = 0; i < shape.points.length - 1; i++) {
                    let start = shape.points[i];
                    let end = shape.points[i + 1];

                    // Apply rotation if needed
                    if (shape.rotation) {
                        start = rotatePoint(start, center, shape.rotation);
                        end = rotatePoint(end, center, shape.rotation);
                    }

                    newShapes.push({
                        ...shape,
                        id: 'pending',
                        type: 'line',
                        points: [start, end],
                        rotation: 0, // Reset rotation since points are now baked
                        // Ensure optional properties that might not be on line are undefined if needed,
                        // but spread works well for styles.
                    });
                }
                idsToDelete.push(id);
            } else if (shape.type === 'rect') {
                // Explode Rect into 4 Lines
                const bounds = getShapeBoundingBox(shape);
                const corners = [
                    { x: bounds.x, y: bounds.y },
                    { x: bounds.x + bounds.width, y: bounds.y },
                    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
                    { x: bounds.x, y: bounds.y + bounds.height }
                ];

                // Rotate corners if needed
                const center = getShapeCenter(shape);
                const finalCorners = shape.rotation
                    ? corners.map(c => rotatePoint(c, center, shape.rotation!))
                    : corners;

                // Create 4 lines
                for (let i = 0; i < 4; i++) {
                    const start = finalCorners[i];
                    const end = finalCorners[(i + 1) % 4];
                    newShapes.push({
                        ...shape,
                        id: 'pending',
                        type: 'line',
                        points: [start, end],
                        rotation: 0, // Reset rotation as points are already rotated
                        x: undefined, y: undefined, width: undefined, height: undefined, // Clear rect props
                    });
                }
                idsToDelete.push(id);
            } else if (shape.type === 'polygon' && shape.sides && shape.radius) {
                // Explode Polygon into Lines
                const center = { x: shape.x || 0, y: shape.y || 0 };
                const radius = shape.radius;
                const sides = shape.sides;
                const rotation = shape.rotation || 0;

                const vertices: Point[] = [];
                // Polygon vertices calculation logic - matching typical implementation
                // Assuming start angle -PI/2 to align top
                for (let i = 0; i < sides; i++) {
                    const angle = -Math.PI / 2 + (i * (2 * Math.PI) / sides);
                    // Point relative to center, unrotated
                    const px = center.x + radius * Math.cos(angle);
                    const py = center.y + radius * Math.sin(angle);

                    // Apply shape rotation
                    vertices.push(rotatePoint({ x: px, y: py }, center, rotation));
                }

                for (let i = 0; i < sides; i++) {
                    const start = vertices[i];
                    const end = vertices[(i + 1) % sides];
                    newShapes.push({
                        ...shape,
                        id: 'pending',
                        type: 'line',
                        points: [start, end],
                        rotation: 0,
                        x: undefined, y: undefined, radius: undefined, sides: undefined,
                    });
                }
                idsToDelete.push(id);
            }
        });

        if (idsToDelete.length > 0 && newShapes.length > 0) {
            const deleteEntries = idsToDelete.map((shapeId) => ({
                shapeId,
                entityId: getEngineId(shapeId),
            }));

            void getEngineRuntime().then((runtime) => {
                const created = newShapes
                    .map((shape) => buildCreateCommand(runtime, shape))
                    .filter((entry): entry is NonNullable<ReturnType<typeof buildCreateCommand>> => !!entry);

                const commands: { op: CommandOp; id: EntityId }[] = [];
                for (const entry of deleteEntries) {
                    if (entry.entityId === null) continue;
                    commands.push({ op: CommandOp.DeleteEntity, id: entry.entityId });
                }

                runtime.apply([...created.map((entry) => entry.cmd), ...commands]);

                for (const entry of created) {
                    const engineLayerId = ensureEngineLayer(runtime, entry.shape.layerId);
                    runtime.engine.setEntityLayer?.(entry.engineId, engineLayerId);
                }

                dataStore.deleteShapes(idsToDelete);
                created.forEach((entry) => dataStore.addShape(entry.shape));
                idsToDelete.forEach((shapeId) => releaseId(shapeId));

                runtime.setSelection(created.map((entry) => entry.engineId), SelectionMode.Replace);
                syncSelectionFromEngine(runtime);
            });
        }
    };

    return {
        deleteSelected,
        deleteLayer,
        zoomToFit,
        joinSelected,
        explodeSelected
    };
};
