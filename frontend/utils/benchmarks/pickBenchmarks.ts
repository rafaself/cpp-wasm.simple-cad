/**
 * Performance Benchmark Suite
 * 
 * Automated benchmarks for pick operations with various scenarios:
 * - Empty documents
 * - Small documents (10-100 entities)
 * - Medium documents (100-1000 entities)
 * - Large documents (1000-10000 entities)
 * 
 * Compares performance across:
 * - pickEx (baseline)
 * - pickExSmart (Phase 1)
 * - pickExCached (Phase 2)
 * 
 * @example
 * import { runPickBenchmarks } from '@/utils/benchmarks/pickBenchmarks';
 * const results = await runPickBenchmarks(runtime);
 * console.table(results);
 */

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { PickResult } from '@/types/picking';
import { getPickProfiler } from '@/utils/pickProfiler';
import { getPickCache, resetPickCache } from '@/utils/pickResultCache';

export interface BenchmarkResult {
  scenario: string;
  method: 'pickEx' | 'pickExSmart' | 'pickExCached';
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  opsPerSecond: number;
  improvement: string;
}

export interface BenchmarkScenario {
  name: string;
  entityCount: number;
  pickCount: number;
  description: string;
}

const SCENARIOS: BenchmarkScenario[] = [
  {
    name: 'Empty Document',
    entityCount: 0,
    pickCount: 1000,
    description: 'No entities, should skip entirely',
  },
  {
    name: 'Small Document',
    entityCount: 50,
    pickCount: 500,
    description: '50 entities, typical simple drawing',
  },
  {
    name: 'Medium Document',
    entityCount: 500,
    pickCount: 200,
    description: '500 entities, typical floor plan',
  },
  {
    name: 'Large Document',
    entityCount: 2000,
    pickCount: 100,
    description: '2000 entities, complex project',
  },
  {
    name: 'Mouse Movement Simulation',
    entityCount: 500,
    pickCount: 144,
    description: 'Simulates 1 second of mouse movement @ 144Hz',
  },
];

/**
 * Runs a single benchmark iteration with comprehensive error handling
 * 
 * @throws {Error} If runtime or method is invalid
 * @throws {Error} If iterations or positions are invalid
 */
function benchmarkMethod(
  runtime: EngineRuntime,
  method: 'pickEx' | 'pickExSmart' | 'pickExCached',
  iterations: number,
  positions: Array<{ x: number; y: number }>
): BenchmarkResult {
  // Input validation
  if (!runtime) {
    throw new Error('benchmarkMethod: runtime is required');
  }
  
  if (!runtime[method] || typeof runtime[method] !== 'function') {
    throw new Error(`benchmarkMethod: method '${method}' is not available on runtime`);
  }
  
  if (iterations <= 0 || !Number.isFinite(iterations)) {
    throw new Error(`benchmarkMethod: invalid iterations count: ${iterations}`);
  }
  
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new Error('benchmarkMethod: positions must be a non-empty array');
  }

  const samples: number[] = [];
  let totalTime = 0;
  let errors = 0;

  try {
    // Warmup with error handling
    for (let i = 0; i < 10; i++) {
      try {
        const pos = positions[i % positions.length];
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
          console.warn(`[Benchmark] Invalid position at index ${i}:`, pos);
          continue;
        }
        runtime[method](pos.x, pos.y, 10, 0xff);
      } catch (error) {
        console.warn(`[Benchmark] Warmup error at iteration ${i}:`, error);
        errors++;
      }
    }

    // Clear cache between runs for fair comparison
    if (method === 'pickExCached') {
      try {
        resetPickCache();
      } catch (error) {
        console.warn('[Benchmark] Failed to reset cache:', error);
      }
    }

    // Actual benchmark with error handling
    for (let i = 0; i < iterations; i++) {
      try {
        const pos = positions[i % positions.length];
        
        // Validate position
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
          console.warn(`[Benchmark] Skipping invalid position at iteration ${i}:`, pos);
          continue;
        }
        
        const start = performance.now();
        runtime[method](pos.x, pos.y, 10, 0xff);
        const duration = performance.now() - start;
        
        // Validate duration
        if (!Number.isFinite(duration) || duration < 0) {
          console.warn(`[Benchmark] Invalid duration at iteration ${i}: ${duration}ms`);
          continue;
        }
        
        samples.push(duration);
        totalTime += duration;
      } catch (error) {
        errors++;
        console.warn(`[Benchmark] Error at iteration ${i}:`, error);
        // Continue benchmarking despite errors
      }
    }

    // Ensure we have enough samples
    if (samples.length === 0) {
      throw new Error(`benchmarkMethod: all ${iterations} iterations failed, no valid samples collected`);
    }

    if (errors > iterations * 0.1) {
      console.warn(`[Benchmark] High error rate: ${errors}/${iterations} (${((errors/iterations)*100).toFixed(1)}%)`);
    }

    // Calculate statistics
    samples.sort((a, b) => a - b);
    const avgTime = totalTime / samples.length; // Use actual sample count
    const minTime = samples[0];
    const maxTime = samples[samples.length - 1];
    const p50 = samples[Math.floor(samples.length * 0.5)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    const p99 = samples[Math.floor(samples.length * 0.99)];
    const opsPerSecond = avgTime > 0 ? 1000 / avgTime : 0;

    return {
      scenario: '',
      method,
      iterations: samples.length, // Actual successful iterations
      totalTime,
      avgTime,
      minTime,
      maxTime,
      p50,
      p95,
      p99,
      opsPerSecond,
      improvement: '',
    };
  } catch (error) {
    console.error(`[Benchmark] Critical error in benchmarkMethod for ${method}:`, error);
    throw error; // Re-throw critical errors
  }
}

/**
 * Generates random pick positions in world coordinates
 */
function generatePickPositions(count: number, spread: number = 1000): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  
  for (let i = 0; i < count; i++) {
    positions.push({
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread,
    });
  }
  
  return positions;
}

/**
 * Populates document with test entities
 * 
 * @throws {Error} If runtime is invalid
 * @throws {Error} If entity creation fails critically
 */
async function setupTestDocument(runtime: EngineRuntime, entityCount: number): Promise<void> {
  if (!runtime) {
    throw new Error('setupTestDocument: runtime is required');
  }
  
  if (entityCount < 0 || !Number.isFinite(entityCount)) {
    throw new Error(`setupTestDocument: invalid entityCount: ${entityCount}`);
  }
  
  try {
    // Clear existing document
    runtime.clear();
    
    if (entityCount === 0) return;

    // Create entities using command buffer
    const commands = [];
    const spread = 1000;
    
    for (let i = 0; i < entityCount; i++) {
      const x = (Math.random() - 0.5) * spread;
      const y = (Math.random() - 0.5) * spread;
      const width = 10 + Math.random() * 90;
      const height = 10 + Math.random() * 90;
      
      commands.push({
        op: 0, // UpsertRect
        x,
        y,
        width,
        height,
        layerId: 1,
        strokeWidth: 1,
        strokeColor: 0xffffffff,
        fillColor: 0x00000000,
        strokeEnabled: true,
        fillEnabled: false,
      });
    }
    
    // Apply all at once
    if (runtime.apply && typeof runtime.apply === 'function') {
      runtime.apply(commands);
    } else {
      throw new Error('setupTestDocument: runtime.apply() is not available');
    }
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 50));
  } catch (error) {
    console.error('[Setup] Failed to setup test document:', error);
    throw error;
  }
}

/**
 * Runs complete benchmark suite with comprehensive error handling
 * 
 * @param runtime EngineRuntime instance
 * @returns Array of benchmark results (may be partial if some scenarios fail)
 * @throws {Error} If runtime is invalid or all scenarios fail
 */
export async function runPickBenchmarks(runtime: EngineRuntime): Promise<BenchmarkResult[]> {
  if (!runtime) {
    throw new Error('runPickBenchmarks: runtime is required');
  }
  
  console.log('🎯 Starting Pick Performance Benchmarks...\n');
  
  const results: BenchmarkResult[] = [];
  const failedScenarios: string[] = [];
  let totalScenarios = SCENARIOS.length;
  let successfulScenarios = 0;
  
  for (const scenario of SCENARIOS) {
    console.log(`📊 Scenario: ${scenario.name}`);
    console.log(`   Entities: ${scenario.entityCount}, Picks: ${scenario.pickCount}`);
    
    try {
      // Setup test document with error handling
      try {
        await setupTestDocument(runtime, scenario.entityCount);
      } catch (setupError) {
        console.error(`  ❌ Failed to setup ${scenario.name}:`, setupError);
        failedScenarios.push(scenario.name);
        console.log('');
        continue; // Skip this scenario
      }
      
      // Generate pick positions with validation
      let positions: Array<{ x: number; y: number }>;
      try {
        positions = generatePickPositions(scenario.pickCount);
        
        if (!positions || positions.length === 0) {
          throw new Error('Generated positions array is empty');
        }
      } catch (posError) {
        console.error(`  ❌ Failed to generate positions for ${scenario.name}:`, posError);
        failedScenarios.push(scenario.name);
        console.log('');
        continue;
      }
      
      // Benchmark each method
      const methods: Array<'pickEx' | 'pickExSmart' | 'pickExCached'> = [
        'pickEx',
        'pickExSmart', 
        'pickExCached'
      ];
      
      const scenarioResults: BenchmarkResult[] = [];
      let scenarioHadErrors = false;
      
      for (const method of methods) {
        try {
          const result = benchmarkMethod(runtime, method, scenario.pickCount, positions);
          result.scenario = scenario.name;
          scenarioResults.push(result);
          
          console.log(`   ${method.padEnd(15)}: ${result.avgTime.toFixed(3)}ms avg`);
        } catch (methodError) {
          console.error(`  ❌ Failed to benchmark ${method} for ${scenario.name}:`, methodError);
          scenarioHadErrors = true;
          // Continue with next method
        }
      }
      
      // Only process results if we have at least one successful method
      if (scenarioResults.length > 0) {
        // Calculate improvements
        const baseline = scenarioResults[0].avgTime;
        for (let i = 0; i < scenarioResults.length; i++) {
          const improvement = ((baseline - scenarioResults[i].avgTime) / baseline) * 100;
          scenarioResults[i].improvement = i === 0 ? 'baseline' : `+${improvement.toFixed(1)}%`;
        }
        
        results.push(...scenarioResults);
        
        if (!scenarioHadErrors) {
          successfulScenarios++;
        }
      } else {
        console.error(`  ❌ All methods failed for ${scenario.name}`);
        failedScenarios.push(scenario.name);
      }
      
      console.log('');
    } catch (scenarioError) {
      console.error(`  ❌ Critical error in scenario ${scenario.name}:`, scenarioError);
      failedScenarios.push(scenario.name);
      console.log('');
      // Continue with next scenario
    }
  }
  
  // Summary
  if (results.length === 0) {
    throw new Error('runPickBenchmarks: All benchmark scenarios failed, no results collected');
  }
  
  if (failedScenarios.length > 0) {
    console.warn(`⚠️  Some scenarios failed: ${failedScenarios.join(', ')}`);
    console.warn(`   Successful: ${successfulScenarios}/${totalScenarios}\n`);
  }
  
  console.log(`✅ Benchmarks Complete! (${successfulScenarios}/${totalScenarios} scenarios successful)\n`);
  
  return results;
}

/**
 * Formats benchmark results as markdown table
 */
export function formatBenchmarkResults(results: BenchmarkResult[]): string {
  let markdown = '# Pick Performance Benchmark Results\n\n';
  
  // Group by scenario
  const byScenario = new Map<string, BenchmarkResult[]>();
  for (const result of results) {
    if (!byScenario.has(result.scenario)) {
      byScenario.set(result.scenario, []);
    }
    byScenario.get(result.scenario)!.push(result);
  }
  
  for (const [scenario, scenarioResults] of byScenario) {
    markdown += `## ${scenario}\n\n`;
    markdown += '| Method | Avg (ms) | Min (ms) | P95 (ms) | P99 (ms) | Ops/s | Improvement |\n';
    markdown += '|--------|----------|----------|----------|----------|-------|-------------|\n';
    
    for (const result of scenarioResults) {
      markdown += `| ${result.method} | ${result.avgTime.toFixed(3)} | ${result.minTime.toFixed(3)} | ${result.p95.toFixed(3)} | ${result.p99.toFixed(3)} | ${result.opsPerSecond.toFixed(0)} | ${result.improvement} |\n`;
    }
    
    markdown += '\n';
  }
  
  return markdown;
}

/**
 * Exports results as JSON for archiving with input sanitization
 * 
 * @param results Benchmark results to export
 * @returns Sanitized JSON string
 * @throws {Error} If results array is invalid
 */
export function exportBenchmarkResults(results: BenchmarkResult[]): string {
  if (!Array.isArray(results)) {
    throw new Error('exportBenchmarkResults: results must be an array');
  }
  
  if (results.length === 0) {
    throw new Error('exportBenchmarkResults: results array is empty');
  }
  
  // Sanitize results to prevent injection attacks and ensure valid data
  const sanitizedResults = results.map((result, index) => {
    // Validate required fields
    if (!result || typeof result !== 'object') {
      console.warn(`[Export] Invalid result at index ${index}, skipping`);
      return null;
    }
    
    return {
      // Sanitize strings (limit length and remove dangerous chars)
      scenario: String(result.scenario || 'Unknown').slice(0, 100).replace(/[<>]/g, ''),
      method: String(result.method || 'unknown').slice(0, 20),
      
      // Ensure numeric fields are valid numbers
      iterations: Math.max(0, Number(result.iterations) || 0),
      totalTime: Math.max(0, Number(result.totalTime) || 0),
      avgTime: Math.max(0, Number(result.avgTime) || 0),
      minTime: Math.max(0, Number(result.minTime) || 0),
      maxTime: Math.max(0, Number(result.maxTime) || 0),
      p50: Math.max(0, Number(result.p50) || 0),
      p95: Math.max(0, Number(result.p95) || 0),
      p99: Math.max(0, Number(result.p99) || 0),
      opsPerSecond: Math.max(0, Number(result.opsPerSecond) || 0),
      
      // Sanitize improvement string
      improvement: String(result.improvement || '').slice(0, 20).replace(/[<>]/g, ''),
    };
  }).filter(Boolean); // Remove null entries
  
  // Sanitize platform string (limit navigator.userAgent length)
  const platform = typeof navigator !== 'undefined' && navigator.userAgent
    ? String(navigator.userAgent).slice(0, 200).replace(/[<>]/g, '')
    : 'Unknown';
  
  try {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      platform,
      results: sanitizedResults,
      meta: {
        totalResults: sanitizedResults.length,
        exportedAt: Date.now(),
      },
    }, null, 2);
  } catch (error) {
    console.error('[Export] Failed to stringify results:', error);
    throw new Error(`exportBenchmarkResults: JSON stringification failed: ${error}`);
  }
}
