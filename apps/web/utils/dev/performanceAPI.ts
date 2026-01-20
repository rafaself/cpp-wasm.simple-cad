/**
 * Performance Testing Utilities
 *
 * Exposed to window for easy access via browser console.
 * Provides quick access to benchmarks and profiling tools.
 *
 * Usage in browser console:
 *
 * // Run benchmarks
 * await window.__perf.runBenchmarks()
 *
 * // Get current stats
 * window.__perf.getStats()
 *
 * // Reset profiler
 * window.__perf.resetProfiler()
 *
 * // Export results
 * window.__perf.exportResults()
 */

/* eslint-disable no-console */

import { getEngineRuntime } from '@/engine/core/singleton';
import {
  runPickBenchmarks,
  formatBenchmarkResults,
  exportBenchmarkResults,
} from '@/utils/benchmarks/pickBenchmarks';
import { getPickProfiler } from '@/utils/pickProfiler';
import { getPickCache, resetPickCache } from '@/utils/pickResultCache';

import {
  setHotPathTimingEnabled,
  isHotPathTimingEnabled,
  logTimingStats,
  resetTimingData,
  getTimingStats,
  getTimingMetricNames,
} from './hotPathTiming';

export interface PerformanceAPI {
  runBenchmarks: () => Promise<void>;
  getStats: () => void;
  resetProfiler: () => void;
  resetCache: () => void;
  exportResults: () => void;
  toggleProfiling: (enabled: boolean) => void;
  help: () => void;
  // Hot path timing
  enableHotPathTiming: (enabled: boolean) => void;
  getHotPathStats: (name?: string) => void;
  resetHotPathStats: () => void;
}

/**
 * Runs complete benchmark suite and displays results
 */
async function runBenchmarks(): Promise<void> {
  console.clear();
  console.log(
    '%c🎯 Pick Performance Benchmarks',
    'font-size: 16px; font-weight: bold; color: #00ff00',
  );
  console.log('');

  try {
    const runtime = await getEngineRuntime();
    const results = await runPickBenchmarks(runtime);

    console.log('%c📊 Results:', 'font-weight: bold; color: #00aaff');
    console.table(results);

    console.log('%c📄 Markdown Report:', 'font-weight: bold; color: #00aaff');
    const markdown = formatBenchmarkResults(results);
    console.log(markdown);

    // Store in sessionStorage for export
    sessionStorage.setItem('lastBenchmarkResults', JSON.stringify(results));

    console.log(
      '%c✅ Benchmarks complete! Use window.__perf.exportResults() to download.',
      'color: #00ff00',
    );
  } catch (error) {
    console.error('%c❌ Benchmark failed:', 'color: #ff0000', error);
  }
}

/**
 * Shows current performance stats
 */
function getStats(): void {
  console.clear();
  console.log(
    '%c📊 Current Performance Stats',
    'font-size: 16px; font-weight: bold; color: #00aaff',
  );
  console.log('');

  try {
    const profiler = getPickProfiler();
    const stats = profiler.getStats();

    console.group('%cProfiler Stats', 'font-weight: bold; color: #ffaa00');
    console.log(`Total Calls: ${stats.totalCalls}`);
    console.log(`Calls/Second: ${stats.callsPerSecond.toFixed(1)}`);
    console.log(`Total Skipped: ${stats.totalSkipped}`);
    console.log(`Skip Rate: ${(stats.skipRate * 100).toFixed(1)}%`);
    console.log(`Avg Time: ${stats.avgTime.toFixed(3)}ms`);
    console.log(`Min/Max: ${stats.minTime.toFixed(3)}ms / ${stats.maxTime.toFixed(3)}ms`);
    console.log(`P50: ${stats.p50.toFixed(3)}ms`);
    console.log(`P95: ${stats.p95.toFixed(3)}ms`);
    console.log(`P99: ${stats.p99.toFixed(3)}ms`);
    console.groupEnd();

    console.log('');

    getEngineRuntime().then((runtime) => {
      try {
        const cache = getPickCache(runtime);
        const cacheStats = cache.getStats();

        console.group('%cCache Stats', 'font-weight: bold; color: #ff00aa');
        console.log(`Size: ${cacheStats.size} / ${cacheStats.maxSize}`);
        console.log(`Hit Rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
        console.log(`Avg Age: ${cacheStats.avgAge.toFixed(1)}ms`);
        console.groupEnd();
      } catch (e) {
        console.log('%cCache not initialized', 'color: #999');
      }
    });
  } catch (error) {
    console.error('%c❌ Failed to get stats:', 'color: #ff0000', error);
  }
}

/**
 * Resets profiler statistics
 */
function resetProfiler(): void {
  try {
    const profiler = getPickProfiler();
    profiler.reset();
    console.log('%c✅ Profiler reset', 'color: #00ff00');
  } catch (error) {
    console.error('%c❌ Failed to reset profiler:', 'color: #ff0000', error);
  }
}

/**
 * Resets pick cache
 */
function resetCacheFunc(): void {
  try {
    resetPickCache();
    console.log('%c✅ Cache reset', 'color: #00ff00');
  } catch (error) {
    console.error('%c❌ Failed to reset cache:', 'color: #ff0000', error);
  }
}

/**
 * Exports benchmark results as downloadable file
 */
function exportResults(): void {
  try {
    const resultsJson = sessionStorage.getItem('lastBenchmarkResults');
    if (!resultsJson) {
      console.warn(
        '%c⚠️  No benchmark results found. Run benchmarks first with runBenchmarks()',
        'color: #ffaa00',
      );
      return;
    }

    const results = JSON.parse(resultsJson);
    const exportData = exportBenchmarkResults(results);

    // Create download
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pick-benchmarks-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('%c✅ Results exported', 'color: #00ff00');
  } catch (error) {
    console.error('%c❌ Failed to export:', 'color: #ff0000', error);
  }
}

/**
 * Toggles profiling on/off
 */
function toggleProfiling(enabled: boolean): void {
  try {
    const profiler = getPickProfiler();
    profiler.setEnabled(enabled);
    console.log(`%c✅ Profiling ${enabled ? 'enabled' : 'disabled'}`, 'color: #00ff00');
  } catch (error) {
    console.error('%c❌ Failed to toggle profiling:', 'color: #ff0000', error);
  }
}

/**
 * Shows help message
 */
function help(): void {
  console.clear();
  console.log('%c🔧 Performance Testing API', 'font-size: 18px; font-weight: bold; color: #00ff00');
  console.log('');
  console.log('%cAvailable Commands:', 'font-weight: bold; color: #00aaff');
  console.log('');
  console.log(
    '%cwindow.__perf.runBenchmarks()%c - Run complete benchmark suite',
    'color: #ffaa00',
    'color: inherit',
  );
  console.log(
    '%cwindow.__perf.getStats()%c      - Show current performance stats',
    'color: #ffaa00',
    'color: inherit',
  );
  console.log(
    '%cwindow.__perf.resetProfiler()%c - Reset profiler statistics',
    'color: #ffaa00',
    'color: inherit',
  );
  console.log(
    '%cwindow.__perf.resetCache()%c    - Clear pick result cache',
    'color: #ffaa00',
    'color: inherit',
  );
  console.log(
    '%cwindow.__perf.exportResults()%c - Download benchmark results as JSON',
    'color: #ffaa00',
    'color: inherit',
  );
  console.log(
    '%cwindow.__perf.toggleProfiling(enabled)%c - Enable/disable profiling',
    'color: #ffaa00',
    'color: inherit',
  );
  console.log(
    '%cwindow.__perf.help()%c          - Show this help',
    'color: #ffaa00',
    'color: inherit',
  );
  console.log('');
  console.log('%cHot Path Timing:', 'font-weight: bold; color: #ff00aa');
  console.log(
    '%cwindow.__perf.enableHotPathTiming(true)%c - Enable pointermove timing',
    'color: #ffaa00',
    'color: inherit',
  );
  console.log(
    '%cwindow.__perf.getHotPathStats()%c        - Show hot path timing stats',
    'color: #ffaa00',
    'color: inherit',
  );
  console.log(
    '%cwindow.__perf.resetHotPathStats()%c      - Reset hot path timing data',
    'color: #ffaa00',
    'color: inherit',
  );
  console.log('');
  console.log('%cExamples:', 'font-weight: bold; color: #00aaff');
  console.log('  await window.__perf.runBenchmarks()');
  console.log('  window.__perf.getStats()');
  console.log('  window.__perf.toggleProfiling(true)');
  console.log('  window.__perf.enableHotPathTiming(true) // then move mouse, then:');
  console.log('  window.__perf.getHotPathStats()');
}

/**
 * Enable/disable hot path timing for pointermove etc
 */
function enableHotPathTiming(enabled: boolean): void {
  setHotPathTimingEnabled(enabled);
  console.log(`%c✅ Hot path timing ${enabled ? 'enabled' : 'disabled'}`, 'color: #00ff00');
  if (enabled) {
    console.log('%cMove mouse in canvas to collect timing data', 'color: #999');
  }
}

/**
 * Show hot path timing statistics
 */
function getHotPathStats(name?: string): void {
  if (!isHotPathTimingEnabled()) {
    console.warn(
      '%c⚠️ Hot path timing is disabled. Enable with enableHotPathTiming(true)',
      'color: #ffaa00',
    );
  }
  logTimingStats(name);
}

/**
 * Reset hot path timing data
 */
function resetHotPathStats(): void {
  resetTimingData();
  console.log('%c✅ Hot path timing data reset', 'color: #00ff00');
}

/**
 * Creates the global performance API
 */
export function createPerformanceAPI(): PerformanceAPI {
  return {
    runBenchmarks,
    getStats,
    resetProfiler,
    resetCache: resetCacheFunc,
    exportResults,
    toggleProfiling,
    help,
    // Hot path timing
    enableHotPathTiming,
    getHotPathStats,
    resetHotPathStats,
  };
}

/**
 * Installs performance API to window object (development only)
 */
export function installPerformanceAPI(): void {
  if (typeof window === 'undefined') return;

  // Only in development
  if (import.meta.env.DEV) {
    (window as any).__perf = createPerformanceAPI();

    console.log(
      '%c🔧 Performance API Loaded',
      'font-size: 14px; font-weight: bold; color: #00ff00; background: #000; padding: 4px 8px; border-radius: 4px;',
    );
    console.log('%cType window.__perf.help() for available commands', 'color: #00aaff');
  }
}
