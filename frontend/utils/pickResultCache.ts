/**
 * PickResultCache - LRU cache for pick results
 * 
 * Caches pick results with spatial hashing for fast lookup.
 * Automatically invalidates on document changes.
 * 
 * Features:
 * - Spatial grid hashing for O(1) lookup
 * - TTL-based expiration
 * - Automatic invalidation on engine events
 * - Configurable cache size
 * 
 * @example
 * const cache = new PickResultCache(runtime, { maxSize: 100, ttlMs: 50 });
 * const result = cache.get(x, y, tolerance, mask) || runtime.pickEx(x, y, tolerance, mask);
 */

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { PickResult } from '@/types/picking';

export interface PickCacheConfig {
  /** Maximum cache entries (default: 100) */
  maxSize: number;
  /** Time-to-live in milliseconds (default: 50ms) */
  ttlMs: number;
  /** Grid cell size for spatial hashing (default: 5 world units) */
  gridSize: number;
}

interface CacheEntry {
  result: PickResult;
  timestamp: number;
  hits: number;
}

interface CacheKey {
  gridX: number;
  gridY: number;
  tolerance: number;
  mask: number;
}

// Interface Segregation: Operations interface
export interface PickCacheOperations {
  get(x: number, y: number, tolerance: number, mask: number): PickResult | null;
  set(x: number, y: number, tolerance: number, mask: number, result: PickResult): void;
  getOrCompute(x: number, y: number, tolerance: number, mask: number, compute: () => PickResult): PickResult;
  clear(): void;
}

// Interface Segregation: Lifecycle interface
export interface PickCacheLifecycle {
  destroy(): void;
}

// Interface Segregation: Statistics interface
export interface PickCacheStatistics {
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    avgAge: number;
  };
}

export class PickResultCache {
  private cache = new Map<string, CacheEntry>();
  private config: PickCacheConfig;
  private runtime: EngineRuntime;
  private lastDocumentGeneration = 0;
  private intervalId: number | null = null;  // Track interval for cleanup

  constructor(
    runtime: EngineRuntime,
    config: Partial<PickCacheConfig> = {}
  ) {
    this.runtime = runtime;
    this.config = {
      maxSize: config.maxSize ?? 100,
      ttlMs: config.ttlMs ?? 50,
      gridSize: config.gridSize ?? 5,
    };

    // Subscribe to document changes for cache invalidation
    this.setupInvalidation();
  }

  /**
   * Gets cached pick result or returns null if not found/expired
   */
  public get(
    x: number,
    y: number,
    tolerance: number,
    mask: number
  ): PickResult | null {
    const key = this.computeKey(x, y, tolerance, mask);
    const keyStr = this.serializeKey(key);
    const entry = this.cache.get(keyStr);

    if (!entry) return null;

    const now = performance.now();
    const age = now - entry.timestamp;

    // Check if expired
    if (age > this.config.ttlMs) {
      this.cache.delete(keyStr);
      return null;
    }

    // Update hit count
    entry.hits++;

    return entry.result;
  }

  /**
   * Stores pick result in cache
   */
  public set(
    x: number,
    y: number,
    tolerance: number,
    mask: number,
    result: PickResult
  ): void {
    // Don't cache empty results (id === 0)
    if (result.id === 0) return;

    const key = this.computeKey(x, y, tolerance, mask);
    const keyStr = this.serializeKey(key);

    // Evict if at capacity (LRU-like)
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.cache.set(keyStr, {
      result,
      timestamp: performance.now(),
      hits: 0,
    });
  }

  /**
   * Gets cached result or computes and caches it
   */
  public getOrCompute(
    x: number,
    y: number,
    tolerance: number,
    mask: number,
    compute: () => PickResult
  ): PickResult {
    const cached = this.get(x, y, tolerance, mask);
    if (cached !== null) return cached;

    const result = compute();
    this.set(x, y, tolerance, mask, result);
    return result;
  }

  /**
   * Clears all cache entries
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Destroys the cache and cleans up resources
   * Call this when cache is no longer needed to prevent memory leaks
   */
  public destroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.clear();
  }

  /**
   * Gets cache statistics
   */
  public getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    avgAge: number;
  } {
    const now = performance.now();
    let totalHits = 0;
    let totalAge = 0;
    let count = 0;

    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      totalAge += now - entry.timestamp;
      count++;
    }

    const totalAccesses = totalHits + count; // misses = initial sets

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: totalAccesses > 0 ? totalHits / totalAccesses : 0,
      avgAge: count > 0 ? totalAge / count : 0,
    };
  }

  /**
   * Computes spatial grid key for position
   */
  private computeKey(
    x: number,
    y: number,
    tolerance: number,
    mask: number
  ): CacheKey {
    const { gridSize } = this.config;
    return {
      gridX: Math.floor(x / gridSize),
      gridY: Math.floor(y / gridSize),
      tolerance: Math.round(tolerance * 10) / 10, // Round to 0.1 precision
      mask,
    };
  }

  /**
   * Serializes cache key to string
   */
  private serializeKey(key: CacheKey): string {
    return `${key.gridX},${key.gridY},${key.tolerance},${key.mask}`;
  }

  /**
   * Evicts least recently used entry
   */
  private evictLRU(): void {
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
   * Sets up automatic cache invalidation on document changes
   */
  private setupInvalidation(): void {
    // Check document generation periodically
    this.intervalId = window.setInterval(() => {
      const stats = this.runtime.engine?.getStats();
      if (!stats) return;

      const currentGen = stats.generation;
      if (currentGen !== this.lastDocumentGeneration) {
        this.clear();
        this.lastDocumentGeneration = currentGen;
      }
    }, 100); // Check every 100ms
  }
}

// --- Factory Pattern ---

export interface PickCacheFactory {
  create(runtime: EngineRuntime, config?: Partial<PickCacheConfig>): PickResultCache;
  getInstance(runtime: EngineRuntime): PickResultCache;
  reset(): void;
}

class DefaultPickCacheFactory implements PickCacheFactory {
  private instance: PickResultCache | null = null;

  create(runtime: EngineRuntime, config?: Partial<PickCacheConfig>): PickResultCache {
    return new PickResultCache(runtime, config);
  }

  getInstance(runtime: EngineRuntime): PickResultCache {
    if (!this.instance) {
      this.instance = this.create(runtime, {
        maxSize: 200,
        ttlMs: 50,
        gridSize: 5,
      });
    }
    return this.instance;
  }

  reset(): void {
    if (this.instance) {
      this.instance.destroy();
      this.instance = null;
    }
  }
}

// Export singleton factory
export const pickCacheFactory = new DefaultPickCacheFactory();

/**
 * Gets the global pick result cache instance
 * @deprecated Use pickCacheFactory.getInstance(runtime) instead
 */
export function getPickCache(runtime: EngineRuntime): PickResultCache {
  return pickCacheFactory.getInstance(runtime);
}

/**
 * Resets the global pick result cache
 * @deprecated Use pickCacheFactory.reset() instead
 */
export function resetPickCache(): void {
  pickCacheFactory.reset();
}
