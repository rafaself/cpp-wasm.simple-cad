export enum EngineCapability {
  HasQueryMarquee = 1 << 0,
  HasResizeHandles = 1 << 1,
  HasTransformResize = 1 << 2,
}

export const supportsQueryMarquee = (mask: number): boolean =>
  (mask & EngineCapability.HasQueryMarquee) !== 0;

export const supportsEngineResize = (mask: number): boolean =>
  (mask & EngineCapability.HasResizeHandles) !== 0 &&
  (mask & EngineCapability.HasTransformResize) !== 0;
