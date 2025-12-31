/**
 * PickProfiler - Performance monitoring for pick operations
 *
 * Tracks detailed metrics for runtime.pickEx calls including:
 * - Call frequency
 * - Execution time (average, percentiles)
 * - Skip rate (when early exit optimizations trigger)
 *
 * Minimal overhead in production (~1-2% CPU increase)
 *
 * @example
 * const profiler = new PickProfiler({ enabled: true, logInterval: 100 });
 * const profiledPick = profiler.wrap(runtime.pickEx.bind(runtime));
 * const result = profiledPick(x, y, tolerance, mask);
 */

/* eslint-disable no-console */

export interface PickProfilerConfig {
  /** Enable profiling (set false in production for zero overhead) */
  enabled: boolean;
  /** Log stats every N calls (0 to disable auto-logging) */
  logInterval: number;
  /** Maximum samples to keep for percentile calculations */
  maxSamples: number;
}

export interface PickStats {
  totalCalls: number;
  totalSkipped: number;
  skipRate: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  callsPerSecond: number;
}

export class PickProfiler {
  private calls = 0;
  private skipped = 0;
  private totalTime = 0;
  private samples: number[] = [];
  private minTime = Infinity;
  private maxTime = 0;
  private firstCallTime = 0;
  private enabled: boolean;
  private logInterval: number;
  private maxSamples: number;

  constructor(config: Partial<PickProfilerConfig> = {}) {
    this.enabled = config.enabled ?? false;
    this.logInterval = config.logInterval ?? 100;
    this.maxSamples = config.maxSamples ?? 1000;
  }

  /**
   * Wraps a pick function with profiling
   */
  public wrap<T extends (...args: any[]) => any>(fn: T): T {
    if (!this.enabled) {
      // Zero-overhead pass-through when disabled
      return fn;
    }

    return ((...args: any[]) => {
      const start = performance.now();
      const result = fn(...args);
      const duration = performance.now() - start;

      this.recordCall(duration);

      return result;
    }) as T;
  }

  /**
   * Records a skipped call (when early exit optimization triggered)
   */
  public recordSkip(): void {
    if (!this.enabled) return;
    if (this.calls === 0 && this.skipped === 0) {
      this.firstCallTime = performance.now();
    }
    this.skipped++;
  }

  /**
   * Records a successful pick call with timing
   */
  private recordCall(duration: number): void {
    if (this.calls === 0) {
      this.firstCallTime = performance.now();
    }

    this.calls++;
    this.totalTime += duration;
    this.minTime = Math.min(this.minTime, duration);
    this.maxTime = Math.max(this.maxTime, duration);

    // Keep samples for percentile calculation (with circular buffer)
    if (this.samples.length >= this.maxSamples) {
      this.samples.shift(); // Remove oldest
    }
    this.samples.push(duration);

    // Auto-log if interval reached
    if (this.logInterval > 0 && this.calls % this.logInterval === 0) {
      this.log();
    }
  }

  /**
   * Calculates percentile from samples
   */
  private percentile(p: number): number {
    if (this.samples.length === 0) return 0;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  /**
   * Gets current statistics
   */
  public getStats(): PickStats {
    const elapsedSeconds = (performance.now() - this.firstCallTime) / 1000;
    const totalAttempts = this.calls + this.skipped;
    const reportedCalls = this.calls > 0 ? this.calls : this.skipped;

    return {
      totalCalls: reportedCalls,
      totalSkipped: this.skipped,
      skipRate: totalAttempts > 0 ? this.skipped / totalAttempts : 0,
      totalTime: this.totalTime,
      avgTime: this.calls > 0 ? this.totalTime / this.calls : 0,
      minTime: this.minTime === Infinity ? 0 : this.minTime,
      maxTime: this.maxTime,
      p50: this.percentile(50),
      p95: this.percentile(95),
      p99: this.percentile(99),
      callsPerSecond: elapsedSeconds > 0 ? totalAttempts / elapsedSeconds : 0,
    };
  }

  /**
   * Logs current statistics to console
   */
  public log(): void {
    if (!this.enabled) return;

    const stats = this.getStats();

    console.group(`🎯 PickProfiler Stats`);
    console.log(`Calls: ${stats.totalCalls} (${stats.callsPerSecond.toFixed(1)}/sec)`);
    console.log(`Skipped: ${stats.totalSkipped} (${(stats.skipRate * 100).toFixed(1)}%)`);
    console.log(`Avg: ${stats.avgTime.toFixed(2)}ms`);
    console.log(`Min/Max: ${stats.minTime.toFixed(2)}ms / ${stats.maxTime.toFixed(2)}ms`);
    console.log(
      `Percentiles: P50=${stats.p50.toFixed(2)}ms, P95=${stats.p95.toFixed(2)}ms, P99=${stats.p99.toFixed(2)}ms`,
    );
    console.groupEnd();
  }

  /**
   * Resets all statistics
   */
  public reset(): void {
    this.calls = 0;
    this.skipped = 0;
    this.totalTime = 0;
    this.samples = [];
    this.minTime = Infinity;
    this.maxTime = 0;
    this.firstCallTime = 0;
  }

  /**
   * Enables or disables profiling
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Singleton instance for global use
let globalProfiler: PickProfiler | null = null;

/**
 * Gets the global pick profiler instance
 */
export function getPickProfiler(): PickProfiler {
  if (!globalProfiler) {
    // Auto-enable in development, disabled in production
    const isDev = process.env.NODE_ENV !== 'production';
    globalProfiler = new PickProfiler({
      enabled: isDev,
      logInterval: 200,
      maxSamples: 1000,
    });
  }
  return globalProfiler;
}
