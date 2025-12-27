/**
 * Text Engine Sync Manager
 * 
 * Centralizes the mapping between JS shape IDs and engine text IDs,
 * and provides synchronization utilities for text operations.
 * 
 * This module bridges the gap between:
 * - React UI state + tools
 * - WASM Engine: Text entity model (TextStore/TextLayout)
 * 
 * Architecture:
 * - Text is created via TextTool → TextBridge → Engine
 * - This manager tracks the ID mapping (now via IdRegistry)
 * - When text entities are deleted/moved, this manager syncs with engine
 */

import type { TextTool } from '@/engine/tools/TextTool';
import { IdRegistry, getEngineId, getShapeId, registerEngineId, releaseId } from './IdRegistry';

let textToolInstance: TextTool | null = null;
const trackedTextShapeIds = new Set<string>();

/**
 * Register the TextTool instance for engine operations.
 */
export function registerTextTool(tool: TextTool | null): void {
  textToolInstance = tool;
}

/**
 * Get the registered TextTool instance.
 */
export function getTextTool(): TextTool | null {
  return textToolInstance;
}

/**
 * Register a text ID ↔ shape ID mapping.
 * Verifies consistency with IdRegistry.
 */
export function registerTextMapping(textId: number, shapeId: string): void {
  const registeredId = getEngineId(shapeId);
  if (registeredId === null) {
    registerEngineId(textId, shapeId);
  } else if (registeredId !== textId) {
    console.error(`[textEngineSync] ID Mismatch! Shape ${shapeId} maps to ${registeredId} but tried to register ${textId}`);
    return;
  }
  
  // Mark as text type
  IdRegistry.setMeta(textId, 'entityType', 'text');
  trackedTextShapeIds.add(shapeId);
}

export function setTextMeta(textId: number, boxMode: number, constraintWidth: number): void {
  IdRegistry.setMeta(textId, 'boxMode', boxMode);
  IdRegistry.setMeta(textId, 'constraintWidth', constraintWidth);
}

export function getTextMeta(textId: number): { boxMode: number; constraintWidth: number } | null {
  const meta = IdRegistry.getMeta(textId);
  if (!meta) return null;
  return {
    boxMode: meta.boxMode ?? 0,
    constraintWidth: meta.constraintWidth ?? 0
  };
}

/**
 * Unregister a text mapping by shape ID.
 * Returns the text ID if found, null otherwise.
 */
export function unregisterTextMappingByShapeId(shapeId: string): number | null {
  // Instead of full release, we might want to just keeping the ID but marking it dead?
  // But the interface says unregister.
  // IdRegistry.release deletes the mapping.
  trackedTextShapeIds.delete(shapeId);
  return releaseId(shapeId);
}

/**
 * Get the text ID for a shape ID.
 */
export function getTextIdForShape(shapeId: string): number | null {
  return getEngineId(shapeId);
}

/**
 * Get the shape ID for a text ID.
 */
export function getShapeIdForText(textId: number): string | null {
  return getShapeId(textId);
}

/**
 * Get all text shape IDs currently tracked.
 * Warning: Iterates all registered shapes.
 */
export function getAllTextShapeIds(): string[] {
  return Array.from(getTrackedTextShapeIds());
}

/**
 * Get the entire mapping (for debugging/iteration).
 */
export function getTextMappings(): { textIdToShapeId: Map<number, string>; shapeIdToTextId: Map<string, number> } {
  // Reconstruct maps for debug compatibility
  const textIdToShapeId = new Map<number, string>();
  const shapeIdToTextId = new Map<string, number>();
  
  for (const shapeId of trackedTextShapeIds) {
    const eid = getEngineId(shapeId);
    if (eid !== null) {
      textIdToShapeId.set(eid, shapeId);
      shapeIdToTextId.set(shapeId, eid);
    }
  }

  return { textIdToShapeId, shapeIdToTextId };
}

/**
 * Delete a text from the engine by its shape ID.
 * This should be called when a text shape is deleted from the JS store.
 */
export function deleteTextByShapeId(shapeId: string): boolean {
  const textId = getEngineId(shapeId);
  if (textId === null) return false;
  
  // Check if it is text
  const meta = IdRegistry.getMeta(textId);
  if (meta?.entityType !== 'text') return false;

  // Release mapping
  trackedTextShapeIds.delete(shapeId);
  releaseId(shapeId);
  
  // Delete from engine
  if (textToolInstance) {
    textToolInstance.deleteTextById(textId);
  }
  
  return true;
}

/**
 * Move a text in the engine to match JS shape position.
 * @param shapeId JS Shape ID
 * @param anchorX New anchor X (top-left in Y-Up world)
 * @param anchorY New anchor Y (top-left in Y-Up world)
 */
export function moveTextByShapeId(shapeId: string, anchorX: number, anchorY: number): boolean {
  const textId = getEngineId(shapeId);
  if (textId === null) return false;
  
  const meta = getTextMeta(textId);
  const boxMode = meta?.boxMode ?? 0;
  const constraintWidth = meta?.constraintWidth ?? 0;

  if (textToolInstance) {
    return textToolInstance.moveText(textId, anchorX, anchorY, boxMode, constraintWidth);
  }

  return false;
}

/**
 * Clear all mappings (e.g., on document reset).
 */
export function clearTextMappings(): void {
  IdRegistry.clear();
  trackedTextShapeIds.clear();
}

export function getTrackedTextShapeIds(): ReadonlySet<string> {
  if (trackedTextShapeIds.size === 0) {
    const allIds = IdRegistry.getAllShapeIds();
    for (const shapeId of allIds) {
      const eid = getEngineId(shapeId);
      if (eid !== null) {
        const meta = IdRegistry.getMeta(eid);
        if (meta?.entityType === 'text') {
          trackedTextShapeIds.add(shapeId);
        }
      }
    }
  } else {
    for (const shapeId of Array.from(trackedTextShapeIds)) {
      if (getEngineId(shapeId) === null) {
        trackedTextShapeIds.delete(shapeId);
      }
    }
  }
  return trackedTextShapeIds;
}
