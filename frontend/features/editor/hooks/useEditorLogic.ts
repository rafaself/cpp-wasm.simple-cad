import { useDataStore } from '../../../stores/useDataStore';
import { useUIStore } from '../../../stores/useUIStore';
import { getCombinedBounds, getShapeBounds, getDistance, getShapeCenter, rotatePoint, getShapeBoundingBox } from '../../../utils/geometry';
import { Shape, Patch, Point } from '../../../types';
import { computeFrameData } from '../../../utils/frame';
import { generateId } from '../../../utils/uuid';

export const useEditorLogic = () => {
    const dataStore = useDataStore();
    const uiStore = useUIStore();

    const deleteSelected = () => {
        const ids = Array.from(uiStore.selectedShapeIds);
        if (ids.length === 0) return;
        dataStore.deleteShapes(ids);
        uiStore.setSelectedShapeIds(new Set());
    };

    const deleteLayer = (id: string) => {
        // We need to know which shapes will be deleted to update selection
        const shapesToDelete: string[] = [];
        Object.values(dataStore.shapes).forEach(s => {
            if (s.layerId === id) shapesToDelete.push(s.id);
        });

        // Perform deletion in DataStore
        const success = dataStore.deleteLayer(id);

        if (success) {
            // Update selection if needed
            const newSelected = new Set(uiStore.selectedShapeIds);
            let changed = false;
            shapesToDelete.forEach(sid => {
                if (newSelected.has(sid)) {
                    newSelected.delete(sid);
                    changed = true;
                }
            });
            if (changed) uiStore.setSelectedShapeIds(newSelected);
        }
    };

    const zoomToFit = () => {
        const frameData = computeFrameData(dataStore.frame, dataStore.worldScale);
        const allShapes = [
            ...Object.values(dataStore.shapes) as Shape[],
            ...(frameData ? frameData.shapes : []),
        ];
        const { canvasSize } = uiStore;

        if (allShapes.length === 0) {
            uiStore.setViewTransform({
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
        const scale = Math.min(availableW / bounds.width, availableH / bounds.height, 5);
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const newX = (canvasSize.width / 2) - (centerX * scale);
        const newY = (canvasSize.height / 2) - (centerY * scale);

        uiStore.setViewTransform({ x: newX, y: newY, scale });
    };

    const joinSelected = () => {
        const ids = Array.from(uiStore.selectedShapeIds);
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
                id: generateId(),
                type: 'polyline',
                points: mergedPoints
            };

            // Using deleteShapes instead of deleteSelected (which will be removed/renamed)
            const idsToDelete = Array.from(processedIds);

            // We need to delete old shapes and add new one.
            // Ideally we want atomic operation or batched history.
            // Current DataStore doesn't expose batched arbitrary ops easily except via internal saveToHistory.
            // But we can call methods.

            dataStore.deleteShapes(idsToDelete);
            dataStore.addShape(newPolyline);

            uiStore.setSelectedShapeIds(new Set([newPolyline.id]));
        }
    };

    const explodeSelected = () => {
        const ids = Array.from(uiStore.selectedShapeIds);
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
                        id: generateId(),
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
                        id: generateId(),
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
                        id: generateId(),
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
            dataStore.deleteShapes(idsToDelete);
            // Add all new shapes
            newShapes.forEach(s => dataStore.addShape(s)); // addShape handles single addition, loop is fine

            // Select new shapes
            uiStore.setSelectedShapeIds(new Set(newShapes.map(s => s.id)));
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
