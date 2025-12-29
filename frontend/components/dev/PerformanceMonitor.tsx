/**
 * PerformanceMonitor - Real-time performance monitoring component
 * 
 * Displays live metrics for pick operations including:
 * - Calls per second
 * - Cache hit rate
 * - Skip rate
 * - Average latency
 * - FPS counter
 * 
 * Usage:
 * <PerformanceMonitor runtime={runtime} position="top-right" />
 */

import React, { useEffect, useState, useRef } from 'react';
import { getPickProfiler } from '@/utils/pickProfiler';
import { getPickCache } from '@/utils/pickResultCache';
import type { EngineRuntime } from '@/engine/core/EngineRuntime';

export interface PerformanceMonitorProps {
  runtime: EngineRuntime | null;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  updateInterval?: number; // ms
  enabled?: boolean;
}

interface Metrics {
  fps: number;
  pickCallsPerSec: number;
  cacheHitRate: number;
  skipRate: number;
  avgPickTime: number;
  p95PickTime: number;
  entityCount: number;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  runtime,
  position = 'top-right',
  updateInterval = 500,
  enabled = true,
}) => {
  const [metrics, setMetrics] = useState<Metrics>({
    fps: 0,
    pickCallsPerSec: 0,
    cacheHitRate: 0,
    skipRate: 0,
    avgPickTime: 0,
    p95PickTime:0,
    entityCount: 0,
  });

  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());

  useEffect(() => {
    if (!enabled || !runtime) return;

    // FPS counter via RAF
    let rafId: number;
    const countFrame = () => {
      frameCountRef.current++;
      rafId = requestAnimationFrame(countFrame);
    };
    rafId = requestAnimationFrame(countFrame);

    // Metrics update interval
    const interval = setInterval(() => {
      // Calculate FPS
      const now = performance.now();
      const elapsed = now - lastFrameTimeRef.current;
      const fps = (frameCountRef.current / elapsed) * 1000;
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;

      // Get profiler stats
      const profiler = getPickProfiler();
      const profilerStats = profiler.getStats();

      // Get cache stats
      let cacheStats = { hitRate: 0, size: 0 };
      try {
        const cache = getPickCache(runtime);
        cacheStats = cache.getStats();
      } catch (e) {
        // Cache not initialized yet
      }

      // Get entity count
      let entityCount = 0;
      const stats = runtime.getStats();
      if (stats) {
        entityCount = stats.rectCount + stats.lineCount + stats.polylineCount + stats.pointCount;
      }

      setMetrics({
        fps: Math.round(fps),
        pickCallsPerSec: Math.round(profilerStats.callsPerSecond),
        cacheHitRate: cacheStats.hitRate,
        skipRate: profilerStats.skipRate,
        avgPickTime: profilerStats.avgTime,
        p95PickTime: profilerStats.p95,
        entityCount,
      });
    }, updateInterval);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(interval);
    };
  }, [runtime, enabled, updateInterval]);

  if (!enabled || !runtime) return null;

  const positionStyles: Record<string, React.CSSProperties> = {
    'top-left': { top: 10, left: 10 },
    'top-right': { top: 10, right: 10 },
    'bottom-left': { bottom: 10, left: 10 },
    'bottom-right': { bottom: 10, right: 10 },
  };

  return (
    <div
      style={{
        position: 'fixed',
        ...positionStyles[position],
        background: 'rgba(0, 0, 0, 0.85)',
        color: '#00ff00',
        fontFamily: 'Monaco, "Courier New", monospace',
        fontSize: '11px',
        padding: '12px',
        borderRadius: '6px',
        border: '1px solid rgba(0, 255, 0, 0.3)',
        zIndex: 10000,
        minWidth: '220px',
        backdropFilter: 'blur(4px)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div style={{ 
        marginBottom: '8px', 
        fontSize: '12px', 
        fontWeight: 'bold',
        color: '#00ff00',
        borderBottom: '1px solid rgba(0, 255, 0, 0.3)',
        paddingBottom: '6px',
      }}>
        ⚡ Performance Monitor
      </div>

      <MetricRow label="FPS" value={metrics.fps} unit="" good={metrics.fps >= 55} />
      <MetricRow 
        label="Pick Calls/s" 
        value={metrics.pickCallsPerSec} 
        unit="" 
        good={metrics.pickCallsPerSec < 100} 
      />
      <MetricRow 
        label="Cache Hit" 
        value={(metrics.cacheHitRate * 100).toFixed(0)} 
        unit="%" 
        good={metrics.cacheHitRate > 0.6} 
      />
      <MetricRow 
        label="Skip Rate" 
        value={(metrics.skipRate * 100).toFixed(0)} 
        unit="%" 
        good={metrics.skipRate > 0.1} 
      />
      <MetricRow 
        label="Avg Time" 
        value={metrics.avgPickTime.toFixed(2)} 
        unit="ms" 
        good={metrics.avgPickTime < 1} 
      />
      <MetricRow 
        label="P95 Time" 
        value={metrics.p95PickTime.toFixed(2)} 
        unit="ms" 
        good={metrics.p95PickTime < 2} 
      />
      <MetricRow 
        label="Entities" 
        value={metrics.entityCount} 
        unit="" 
        good={true} 
      />
    </div>
  );
};

interface MetricRowProps {
  label: string;
  value: number | string;
  unit: string;
  good: boolean;
}

const MetricRow: React.FC<MetricRowProps> = ({ label, value, unit, good }) => {
  const color = good ? '#00ff00' : '#ff9900';
  
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      marginBottom: '4px',
      padding: '2px 0',
    }}>
      <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{label}:</span>
      <span style={{ 
        color, 
        fontWeight: 'bold',
        marginLeft: '8px',
      }}>
        {value}{unit}
      </span>
    </div>
  );
};

export default PerformanceMonitor;
