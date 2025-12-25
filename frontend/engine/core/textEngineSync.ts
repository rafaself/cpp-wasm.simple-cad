/**
 * Text Engine Sync Manager
 * 
 * Centralizes the mapping between JS shape IDs and engine text IDs,
 * and provides synchronization utilities for text operations.
 * 
 * This module bridges the gap between:
 * - React/Zustand: Shape-based data model (useDataStore)
 * - WASM Engine: Text entity model (TextStore/TextLayout)
 * 
 * Architecture:
 * - Text is created via TextTool → TextBridge → Engine
 * - This manager tracks the ID mapping
 * - When shapes are deleted/moved, this manager syncs with engine
 */

import type { TextTool } from '@/engine/tools/TextTool';

// Singleton state for text ID mapping
let textIdToShapeId = new Map<number, string>();
let shapeIdToTextId = new Map<string, number>();
let textMeta = new Map<number, { boxMode: number; constraintWidth: number }>();
let textToolInstance: TextTool | null = null;

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
 */
export function registerTextMapping(textId: number, shapeId: string): void {
  textIdToShapeId.set(textId, shapeId);
  shapeIdToTextId.set(shapeId, textId);
}

export function setTextMeta(textId: number, boxMode: number, constraintWidth: number): void {
  textMeta.set(textId, { boxMode, constraintWidth });
}

export function getTextMeta(textId: number): { boxMode: number; constraintWidth: number } | null {
  return textMeta.get(textId) ?? null;
}

/**
 * Unregister a text mapping by shape ID.
 * Returns the text ID if found, null otherwise.
 */
export function unregisterTextMappingByShapeId(shapeId: string): number | null {
  const textId = shapeIdToTextId.get(shapeId);
  if (textId === undefined) return null;
  
  shapeIdToTextId.delete(shapeId);
  textIdToShapeId.delete(textId);
  textMeta.delete(textId);
  return textId;
}

/**
 * Get the text ID for a shape ID.
 */
export function getTextIdForShape(shapeId: string): number | null {
  return shapeIdToTextId.get(shapeId) ?? null;
}

/**
 * Get the shape ID for a text ID.
 */
export function getShapeIdForText(textId: number): string | null {
  return textIdToShapeId.get(textId) ?? null;
}

/**
 * Get all text shape IDs currently tracked.
 */
export function getAllTextShapeIds(): string[] {
  return Array.from(shapeIdToTextId.keys());
}

/**
 * Get the entire mapping (for debugging/iteration).
 */
export function getTextMappings(): { textIdToShapeId: Map<number, string>; shapeIdToTextId: Map<string, number> } {
  return { textIdToShapeId, shapeIdToTextId };
}

/**
 * Delete a text from the engine by its shape ID.
 * This should be called when a text shape is deleted from the JS store.
 */
export function deleteTextByShapeId(shapeId: string): boolean {
  const textId = shapeIdToTextId.get(shapeId);
  if (textId === undefined) return false;
  
  // Remove from mappings
  shapeIdToTextId.delete(shapeId);
  textIdToShapeId.delete(textId);
  
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
  const textId = shapeIdToTextId.get(shapeId);
  if (textId === undefined) return false;
  const meta = textMeta.get(textId);
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
  textIdToShapeId.clear();
  shapeIdToTextId.clear();
  textMeta.clear();
}
