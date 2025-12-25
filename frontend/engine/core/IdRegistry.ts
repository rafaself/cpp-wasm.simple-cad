/**
 * Centralized ID registry for mapping between JS shape IDs (string)
 * and WASM engine entity IDs (uint32).
 *
 * Single source of truth for all ID mappings in the application.
 */
class IdRegistryImpl {
  private nextEngineId = 1;
  private shapeToEngine = new Map<string, number>();
  private engineToShape = new Map<number, string>();
  private entityMeta = new Map<number, EntityMeta>();

  /**
   * Allocate or retrieve an engine ID for a shape ID.
   * If the shape already has an engine ID, returns the existing one.
   */
  ensureEngineId(shapeId: string): number {
    let engineId = this.shapeToEngine.get(shapeId);
    if (engineId === undefined) {
      engineId = this.nextEngineId++;
      this.shapeToEngine.set(shapeId, engineId);
      this.engineToShape.set(engineId, shapeId);
    }
    return engineId;
  }

  /**
   * Get the engine ID for a shape, or null if not registered.
   */
  getEngineId(shapeId: string): number | null {
    return this.shapeToEngine.get(shapeId) ?? null;
  }

  /**
   * Get the shape ID for an engine ID, or null if not registered.
   */
  getShapeId(engineId: number): string | null {
    return this.engineToShape.get(engineId) ?? null;
  }

  /**
   * Release the mapping for a shape ID.
   * Call when a shape is deleted.
   */
  release(shapeId: string): number | null {
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
    engineId: number,
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
  getMeta(engineId: number): EntityMeta | null {
    return this.entityMeta.get(engineId) ?? null;
  }

  /**
   * Clear all mappings (e.g., on document reset).
   */
  clear(): void {
    this.shapeToEngine.clear();
    this.engineToShape.clear();
    this.entityMeta.clear();
    this.nextEngineId = 1;
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
export const ensureId = (shapeId: string) => IdRegistry.ensureEngineId(shapeId);
export const getEngineId = (shapeId: string) => IdRegistry.getEngineId(shapeId);
export const getShapeId = (engineId: number) => IdRegistry.getShapeId(engineId);
export const releaseId = (shapeId: string) => IdRegistry.release(shapeId);
