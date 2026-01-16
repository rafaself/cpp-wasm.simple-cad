/**
 * Marshaling Benchmark Utilities
 *
 * Measures the performance of JS ↔ WASM data transfer.
 * Used to identify bottlenecks in the Engine-First architecture.
 *
 * Usage:
 *   import { runMarshalingBenchmark } from '@/utils/benchmark/marshalingBenchmark';
 *   const results = await runMarshalingBenchmark();
 *   console.table(results);
 */

/* eslint-disable no-console */

import { CommandOp, type EngineCommand } from '@/engine/core/commandTypes';
import { encodeCommandBuffer } from '@/engine/core/commandBuffer';
import { getEngineRuntime } from '@/engine/core/singleton';

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSecond: number;
}

/**
 * Run a single benchmark.
 */
function benchmark(name: string, iterations: number, fn: () => void): BenchmarkResult {
  // Warmup
  for (let i = 0; i < Math.min(10, iterations); i++) {
    fn();
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();

  const totalMs = end - start;
  const avgMs = totalMs / iterations;
  const opsPerSecond = iterations / (totalMs / 1000);

  return { name, iterations, totalMs, avgMs, opsPerSecond };
}

/**
 * Benchmark command buffer encoding.
 */
function benchmarkCommandEncode(iterations: number): BenchmarkResult {
  const commands: EngineCommand[] = [
    {
      op: CommandOp.UpsertRect,
      id: 1,
      rect: {
        x: 10,
        y: 20,
        w: 30,
        h: 40,
        fillR: 1,
        fillG: 0,
        fillB: 0,
        fillA: 1,
        strokeR: 0,
        strokeG: 0,
        strokeB: 0,
        strokeA: 1,
        strokeEnabled: 1,
        strokeWidthPx: 1,
      },
    },
  ];

  return benchmark('CommandBuffer Encode (1 rect)', iterations, () => {
    encodeCommandBuffer(commands);
  });
}

/**
 * Benchmark multi-command encoding.
 */
function benchmarkMultiCommandEncode(iterations: number): BenchmarkResult {
  const commands: EngineCommand[] = [];
  for (let i = 0; i < 100; i++) {
    commands.push({
      op: CommandOp.UpsertRect,
      id: i + 1,
      rect: {
        x: i * 10,
        y: i * 10,
        w: 30,
        h: 40,
        fillR: 1,
        fillG: 0,
        fillB: 0,
        fillA: 1,
        strokeR: 0,
        strokeG: 0,
        strokeB: 0,
        strokeA: 1,
        strokeEnabled: 1,
        strokeWidthPx: 1,
      },
    });
  }

  return benchmark('CommandBuffer Encode (100 rects)', iterations, () => {
    encodeCommandBuffer(commands);
  });
}

/**
 * Benchmark snapshot read.
 */
async function benchmarkSnapshotRead(iterations: number): Promise<BenchmarkResult> {
  const runtime = await getEngineRuntime();

  // Create some entities first
  const commands: EngineCommand[] = [];
  for (let i = 0; i < 50; i++) {
    commands.push({
      op: CommandOp.UpsertRect,
      id: runtime.allocateEntityId(),
      rect: {
        x: i * 10,
        y: i * 10,
        w: 30,
        h: 40,
        fillR: 1,
        fillG: 0,
        fillB: 0,
        fillA: 1,
        strokeR: 0,
        strokeG: 0,
        strokeB: 0,
        strokeA: 1,
        strokeEnabled: 1,
        strokeWidthPx: 1,
      },
    });
  }
  runtime.apply(commands);

  return benchmark('Snapshot Read (50 entities)', iterations, () => {
    runtime.saveSnapshotBytes();
  });
}

/**
 * Benchmark picking operation.
 */
async function benchmarkPick(iterations: number): Promise<BenchmarkResult> {
  const runtime = await getEngineRuntime();

  return benchmark('pickEx (single query)', iterations, () => {
    runtime.pickEx(100, 100, 5, 0xff);
  });
}

/**
 * Benchmark selection query.
 */
async function benchmarkSelectionQuery(iterations: number): Promise<BenchmarkResult> {
  const runtime = await getEngineRuntime();

  // Select some entities
  const ids = Array.from(runtime.getDrawOrderSnapshot()).slice(0, 10);
  if (ids.length > 0) {
    runtime.setSelection(Array.from(ids), 0);
  }

  return benchmark('getSelectionIds()', iterations, () => {
    runtime.getSelectionIds();
  });
}

/**
 * Benchmark text content read.
 */
async function benchmarkTextContentRead(iterations: number): Promise<BenchmarkResult> {
  const runtime = await getEngineRuntime();

  // Find a text entity
  const textMetas = runtime.getAllTextMetas();
  if (textMetas.length === 0) {
    return {
      name: 'getTextContent (no text entities)',
      iterations: 0,
      totalMs: 0,
      avgMs: 0,
      opsPerSecond: 0,
    };
  }

  const textId = textMetas[0].id;

  return benchmark(`getTextContent (id=${textId})`, iterations, () => {
    runtime.getTextContent(textId);
  });
}

/**
 * Run all benchmarks and return results.
 */
export async function runMarshalingBenchmark(iterationsPerTest = 1000): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Sync benchmarks
  results.push(benchmarkCommandEncode(iterationsPerTest));
  results.push(benchmarkMultiCommandEncode(iterationsPerTest / 10)); // Fewer iterations for heavier test

  // Async benchmarks (need runtime)
  results.push(await benchmarkSnapshotRead(iterationsPerTest / 10));
  results.push(await benchmarkPick(iterationsPerTest));
  results.push(await benchmarkSelectionQuery(iterationsPerTest));
  results.push(await benchmarkTextContentRead(iterationsPerTest));

  return results;
}

/**
 * Print benchmark results to console in a formatted table.
 */
export function printBenchmarkResults(results: BenchmarkResult[]): void {
  console.log('\n=== Marshaling Benchmark Results ===\n');
  console.table(
    results.map((r) => ({
      Name: r.name,
      Iterations: r.iterations,
      'Total (ms)': r.totalMs.toFixed(2),
      'Avg (ms)': r.avgMs.toFixed(4),
      'Ops/sec': Math.round(r.opsPerSecond).toLocaleString(),
    })),
  );
}

/**
 * Quick benchmark for development (callable from console).
 */
export async function quickBenchmark(): Promise<void> {
  console.log('Running marshaling benchmark...');
  const results = await runMarshalingBenchmark(100);
  printBenchmarkResults(results);
}

// Export for console access
if (typeof window !== 'undefined') {
  (window as any).runMarshalingBenchmark = runMarshalingBenchmark;
  (window as any).quickBenchmark = quickBenchmark;
}
