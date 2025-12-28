import type { EntityId } from './protocol';

/**
 * Centralized ID registry for mapping between JS shape IDs (string)
 * and WASM engine entity IDs (uint32).
 *
 * Single source of truth for all ID mappings in the application.
 */
class IdRegistryImpl {
  private shapeToEngine = new Map<string, EntityId>();
  private engineToShape = new Map<EntityId, string>();
  private entityMeta = new Map<EntityId, EntityMeta>();

  /**
   * Retrieve an engine ID for a shape ID.
   * Throws when the mapping is missing (engine-owned IDs only).
   */
  ensureEngineId(shapeId: string): EntityId {
    const engineId = this.shapeToEngine.get(shapeId);
    if (engineId === undefined) {
      throw new Error(`[IdRegistry] Missing engine ID for shape: ${shapeId}`);
    }
    return engineId;
  }

  /**
   * Register a pre-existing engine ID mapping (used for snapshot hydration).
   */
  registerEngineId(engineId: EntityId, shapeId: string): void {
    this.shapeToEngine.set(shapeId, engineId);
    this.engineToShape.set(engineId, shapeId);
  }

  /**
   * Get the engine ID for a shape, or null if not registered.
   */
  getEngineId(shapeId: string): EntityId | null {
    return this.shapeToEngine.get(shapeId) ?? null;
  }

  /**
   * Get the shape ID for an engine ID, or null if not registered.
   */
  getShapeId(engineId: EntityId): string | null {
    return this.engineToShape.get(engineId) ?? null;
  }

  /**
   * Release the mapping for a shape ID.
   * Call when a shape is deleted.
   */
  release(shapeId: string): EntityId | null {
    const engineId = this.shapeToEngine.get(shapeId);
    if (engineId === undefined) return null;

    this.shapeToEngine.delete(shapeId);
    this.engineToShape.delete(engineId);
    this.entityMeta.delete(engineId);

    return engineId;
  }

  /**
   * Store entity-specific metadata.
   */
  setMeta<K extends keyof EntityMeta>(
    engineId: EntityId,
    key: K,
    value: EntityMeta[K]
  ): void {
    const meta = this.entityMeta.get(engineId) ?? {};
    meta[key] = value;
    this.entityMeta.set(engineId, meta);
  }

  /**
   * Get entity metadata.
   */
  getMeta(engineId: EntityId): EntityMeta | null {
    return this.entityMeta.get(engineId) ?? null;
  }

  /**
   * Clear all mappings (e.g., on document reset).
   */
  clear(): void {
    this.shapeToEngine.clear();
    this.engineToShape.clear();
    this.entityMeta.clear();
  }

  /**
   * Override the next engine ID (used for snapshot hydration).
   */
  setNextEngineId(nextId: EntityId): void {
    void nextId;
  }

  /**
   * Get all registered shape IDs.
   */
  getAllShapeIds(): string[] {
    return Array.from(this.shapeToEngine.keys());
  }
}

interface EntityMeta {
  entityType?:
    | "rect"
    | "line"
    | "polyline"
    | "text"
    | "circle"
    | "polygon"
    | "arrow"
    | "symbol";
  boxMode?: number; // For text
  constraintWidth?: number; // For text
}

// Singleton export
export const IdRegistry = new IdRegistryImpl();

// Convenience functions for common operations
export const ensureId = (shapeId: string): EntityId => IdRegistry.ensureEngineId(shapeId);
export const getEngineId = (shapeId: string): EntityId | null => IdRegistry.getEngineId(shapeId);
export const getShapeId = (engineId: EntityId): string | null => IdRegistry.getShapeId(engineId);
export const releaseId = (shapeId: string): EntityId | null => IdRegistry.release(shapeId);
export const registerEngineId = (engineId: EntityId, shapeId: string): void =>
  IdRegistry.registerEngineId(engineId, shapeId);
export const setNextEngineId = (nextId: EntityId): void => IdRegistry.setNextEngineId(nextId);
