/**
 * Hot Path Timing Utilities
 *
 * Lightweight timing utilities for measuring performance of hot paths
 * like pointermove handlers. Uses Performance API marks/measures.
 *
 * Design goals:
 * - Zero allocation in hot paths when disabled
 * - Minimal overhead when enabled (~0.01ms per call)
 * - Rolling statistics without unbounded memory growth
 */

/** Maximum samples to keep for rolling statistics */
const MAX_SAMPLES = 1000;

/** Timing data for a single metric */
interface TimingMetric {
  samples: Float64Array;
  sampleIndex: number;
  sampleCount: number;
  totalCalls: number;
  lastValue: number;
}

/** Stats computed from timing data */
export interface TimingStats {
  totalCalls: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  lastMs: number;
}

/** Global timing state */
const metrics = new Map<string, TimingMetric>();
let enabled = false;

// Reusable start time storage to avoid closure allocation
const startTimes = new Map<string, number>();

/**
 * Creates a new timing metric
 */
function createMetric(): TimingMetric {
  return {
    samples: new Float64Array(MAX_SAMPLES),
    sampleIndex: 0,
    sampleCount: 0,
    totalCalls: 0,
    lastValue: 0,
  };
}

/**
 * Records a timing sample
 */
function recordSample(metric: TimingMetric, durationMs: number): void {
  metric.samples[metric.sampleIndex] = durationMs;
  metric.sampleIndex = (metric.sampleIndex + 1) % MAX_SAMPLES;
  metric.sampleCount = Math.min(metric.sampleCount + 1, MAX_SAMPLES);
  metric.totalCalls++;
  metric.lastValue = durationMs;
}

/**
 * Computes percentile from sorted array
 */
function percentile(sorted: Float64Array, count: number, p: number): number {
  if (count === 0) return 0;
  const index = Math.ceil((p / 100) * count) - 1;
  return sorted[Math.max(0, Math.min(index, count - 1))];
}

/**
 * Enables or disables hot path timing
 */
export function setHotPathTimingEnabled(value: boolean): void {
  enabled = value;
}

/**
 * Returns whether hot path timing is enabled
 */
export function isHotPathTimingEnabled(): boolean {
  return enabled;
}

/**
 * Starts timing a named operation.
 * Call endTiming() with the same name to record the duration.
 *
 * @param name - Unique name for this timing (e.g., 'pointermove', 'pick')
 */
export function startTiming(name: string): void {
  if (!enabled) return;
  startTimes.set(name, performance.now());
}

/**
 * Ends timing and records the duration.
 *
 * @param name - Same name used in startTiming()
 * @returns Duration in ms, or -1 if timing wasn't started or disabled
 */
export function endTiming(name: string): number {
  if (!enabled) return -1;

  const startTime = startTimes.get(name);
  if (startTime === undefined) return -1;

  const duration = performance.now() - startTime;
  startTimes.delete(name);

  let metric = metrics.get(name);
  if (!metric) {
    metric = createMetric();
    metrics.set(name, metric);
  }

  recordSample(metric, duration);
  return duration;
}

/**
 * Gets timing statistics for a named metric
 */
export function getTimingStats(name: string): TimingStats | null {
  const metric = metrics.get(name);
  if (!metric || metric.sampleCount === 0) return null;

  // Copy and sort samples for percentile calculation
  const count = metric.sampleCount;
  const sorted = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    sorted[i] = metric.samples[i];
  }
  sorted.sort();

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const v = sorted[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  return {
    totalCalls: metric.totalCalls,
    avgMs: sum / count,
    minMs: min,
    maxMs: max,
    p50Ms: percentile(sorted, count, 50),
    p95Ms: percentile(sorted, count, 95),
    p99Ms: percentile(sorted, count, 99),
    lastMs: metric.lastValue,
  };
}

/**
 * Gets all available metric names
 */
export function getTimingMetricNames(): string[] {
  return Array.from(metrics.keys());
}

/**
 * Resets all timing data
 */
export function resetTimingData(): void {
  metrics.clear();
  startTimes.clear();
}

/**
 * Resets timing data for a specific metric
 */
export function resetTimingMetric(name: string): void {
  metrics.delete(name);
  startTimes.delete(name);
}

/**
 * Prints timing stats to console (dev utility)
 */
export function logTimingStats(name?: string): void {
  const names = name ? [name] : getTimingMetricNames();

  if (names.length === 0) {
    console.log('%c⏱️ No timing data collected', 'color: #999');
    return;
  }

  console.group('%c⏱️ Hot Path Timing Stats', 'font-weight: bold; color: #00aaff');

  for (const n of names) {
    const stats = getTimingStats(n);
    if (!stats) continue;

    const isOk = stats.p95Ms < 16;
    const color = isOk ? '#00ff00' : '#ff6600';

    console.group(`%c${n}`, `font-weight: bold; color: ${color}`);
    console.log(`Total Calls: ${stats.totalCalls}`);
    console.log(`Avg: ${stats.avgMs.toFixed(3)}ms`);
    console.log(`Min/Max: ${stats.minMs.toFixed(3)}ms / ${stats.maxMs.toFixed(3)}ms`);
    console.log(`P50: ${stats.p50Ms.toFixed(3)}ms`);
    console.log(`P95: ${stats.p95Ms.toFixed(3)}ms ${stats.p95Ms >= 16 ? '⚠️ >16ms!' : '✓'}`);
    console.log(`P99: ${stats.p99Ms.toFixed(3)}ms`);
    console.log(`Last: ${stats.lastMs.toFixed(3)}ms`);
    console.groupEnd();
  }

  console.groupEnd();
}
