/**
 * Grip Performance Monitoring
 *
 * Tracks rendering performance and cache effectiveness for polygon grips.
 *
 * Phase 3: Performance tuning - observability and optimization
 */

/**
 * Performance metrics for grip rendering
 */
interface GripPerformanceMetrics {
  renderCount: number;
  totalRenderTimeMs: number;
  avgRenderTimeMs: number;
  maxRenderTimeMs: number;
  gripCount: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  lastUpdateTimestamp: number;
}

/**
 * Grip cache entry for memoization
 */
interface GripCacheEntry {
  entityId: number;
  generation: number;
  gripsData: Float32Array;
  timestamp: number;
  hits: number;
}

/**
 * Performance monitor for grip rendering
 */
class GripPerformanceMonitor {
  private metrics: GripPerformanceMetrics = {
    renderCount: 0,
    totalRenderTimeMs: 0,
    avgRenderTimeMs: 0,
    maxRenderTimeMs: 0,
    gripCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheHitRate: 0,
    lastUpdateTimestamp: 0,
  };

  private cache = new Map<string, GripCacheEntry>();
  private maxCacheSize = 100;
  private cacheTTL = 5000; // 5 seconds

  /**
   * Record a grip rendering operation
   */
  recordRender(gripCount: number, durationMs: number): void {
    this.metrics.renderCount++;
    this.metrics.totalRenderTimeMs += durationMs;
    this.metrics.avgRenderTimeMs = this.metrics.totalRenderTimeMs / this.metrics.renderCount;
    this.metrics.maxRenderTimeMs = Math.max(this.metrics.maxRenderTimeMs, durationMs);
    this.metrics.gripCount = gripCount;
    this.metrics.lastUpdateTimestamp = Date.now();

    // Warn if rendering is slow
    if (durationMs > 16.67 && import.meta.env.DEV) {
      console.warn(
        `[GripPerf] Slow grip render: ${durationMs.toFixed(2)}ms for ${gripCount} grips`,
      );
    }
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(): void {
    this.metrics.cacheHits++;
    this.updateCacheHitRate();
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
    this.updateCacheHitRate();
  }

  private updateCacheHitRate(): void {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    this.metrics.cacheHitRate = total > 0 ? this.metrics.cacheHits / total : 0;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): GripPerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cache entry if valid
   */
  getCacheEntry(entityId: number, generation: number): GripCacheEntry | null {
    const key = `${entityId}-${generation}`;
    const entry = this.cache.get(key);

    if (!entry) {
      this.recordCacheMiss();
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      this.recordCacheMiss();
      return null;
    }

    entry.hits++;
    this.recordCacheHit();
    return entry;
  }

  /**
   * Set cache entry
   */
  setCacheEntry(entityId: number, generation: number, gripsData: Float32Array): void {
    // Evict old entries if at capacity
    if (this.cache.size >= this.maxCacheSize) {
      this.evictOldestEntry();
    }

    const key = `${entityId}-${generation}`;
    this.cache.set(key, {
      entityId,
      generation,
      gripsData: gripsData.slice(), // Copy to prevent mutation
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Invalidate cache for specific entity
   */
  invalidateEntity(entityId: number): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.entityId === entityId) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Evict least recently used entry
   */
  private evictOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      renderCount: 0,
      totalRenderTimeMs: 0,
      avgRenderTimeMs: 0,
      maxRenderTimeMs: 0,
      gripCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      lastUpdateTimestamp: 0,
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ entityId: number; generation: number; hits: number; age: number }>;
  } {
    const now = Date.now();
    const entries: Array<{ entityId: number; generation: number; hits: number; age: number }> = [];

    for (const entry of this.cache.values()) {
      entries.push({
        entityId: entry.entityId,
        generation: entry.generation,
        hits: entry.hits,
        age: now - entry.timestamp,
      });
    }

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.metrics.cacheHitRate,
      entries: entries.sort((a, b) => b.hits - a.hits),
    };
  }

  /**
   * Format metrics for display
   */
  formatMetrics(): string {
    const m = this.metrics;
    return [
      `Grip Rendering Performance:`,
      `  Renders: ${m.renderCount}`,
      `  Avg Time: ${m.avgRenderTimeMs.toFixed(2)}ms`,
      `  Max Time: ${m.maxRenderTimeMs.toFixed(2)}ms`,
      `  Last Grip Count: ${m.gripCount}`,
      `  Cache Hit Rate: ${(m.cacheHitRate * 100).toFixed(1)}%`,
      `  Cache Size: ${this.cache.size}/${this.maxCacheSize}`,
    ].join('\n');
  }

  /**
   * Log metrics to console (dev only)
   */
  logMetrics(): void {
    if (!import.meta.env.DEV) return;
    console.log(this.formatMetrics());
  }
}

// Global singleton instance
let globalMonitor: GripPerformanceMonitor | null = null;

/**
 * Get the global grip performance monitor
 */
export function getGripPerformanceMonitor(): GripPerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new GripPerformanceMonitor();
  }
  return globalMonitor;
}

/**
 * Measure grip rendering time
 */
export function measureGripRender<T>(gripCount: number, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  getGripPerformanceMonitor().recordRender(gripCount, duration);

  return result;
}

/**
 * Hook for React components to track renders
 */
export function useGripPerformanceTracking(gripCount: number): void {
  if (import.meta.env.DEV) {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      getGripPerformanceMonitor().recordRender(gripCount, duration);
    };
  }
}

// Export type for external use
export type { GripPerformanceMetrics };
