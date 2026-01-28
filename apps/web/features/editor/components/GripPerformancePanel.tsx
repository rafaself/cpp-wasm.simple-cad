/**
 * GripPerformancePanel - Developer-only panel for grip performance monitoring
 *
 * Shows real-time metrics for grip rendering, caching, and budget decisions.
 *
 * Phase 3: Observability and debugging
 */

import React, { useEffect, useState } from 'react';

import { useSettingsStore } from '@/stores/useSettingsStore';
import { getGripPerformanceMonitor } from '@/utils/gripPerformance';

import type { GripPerformanceMetrics, CacheStatistics } from '@/utils/gripPerformance';

export const GripPerformancePanel: React.FC = () => {
  const [metrics, setMetrics] = useState<GripPerformanceMetrics | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStatistics | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const enableMonitoring = useSettingsStore((s) => s.featureFlags.enableGripPerformanceMonitoring);

  useEffect(() => {
    if (!enableMonitoring) return;

    const monitor = getGripPerformanceMonitor();

    // Update metrics every 500ms
    const interval = setInterval(() => {
      setMetrics(monitor.getMetrics());
      setCacheStats(monitor.getCacheStats());
    }, 500);

    return () => clearInterval(interval);
  }, [enableMonitoring]);

  if (!enableMonitoring || !metrics) return null;

  const handleReset = () => {
    getGripPerformanceMonitor().reset();
    setMetrics(getGripPerformanceMonitor().getMetrics());
  };

  const handleClearCache = () => {
    getGripPerformanceMonitor().clearCache();
    setCacheStats(getGripPerformanceMonitor().getCacheStats());
  };

  return (
    <div className="fixed bottom-4 right-4 z-canvas-hud max-w-sm">
      <div className="rounded-lg border bg-surface-2 shadow-2xl">
        {/* Header */}
        <div
          className="flex cursor-pointer items-center justify-between border-b px-3 py-2"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="text-xs font-semibold text-text">Grip Performance</span>
          </div>
          <button className="text-xs text-text-muted hover:text-text">
            {isExpanded ? '▼' : '▲'}
          </button>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="space-y-3 p-3 text-xs">
            {/* Render Metrics */}
            <div className="space-y-1">
              <div className="font-semibold text-text">Rendering</div>
              <div className="space-y-0.5 text-text-muted">
                <div className="flex justify-between">
                  <span>Renders:</span>
                  <span className="font-mono">{metrics.renderCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Time:</span>
                  <span className="font-mono">{metrics.avgRenderTimeMs.toFixed(2)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Time:</span>
                  <span className="font-mono">{metrics.maxRenderTimeMs.toFixed(2)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Count:</span>
                  <span className="font-mono">{metrics.gripCount} grips</span>
                </div>
              </div>
            </div>

            {/* Cache Metrics */}
            <div className="space-y-1 border-t pt-2">
              <div className="font-semibold text-text">Cache</div>
              <div className="space-y-0.5 text-text-muted">
                <div className="flex justify-between">
                  <span>Hit Rate:</span>
                  <span className="font-mono">{(metrics.cacheHitRate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Hits:</span>
                  <span className="font-mono">{metrics.cacheHits}</span>
                </div>
                <div className="flex justify-between">
                  <span>Misses:</span>
                  <span className="font-mono">{metrics.cacheMisses}</span>
                </div>
                {cacheStats && (
                  <div className="flex justify-between">
                    <span>Size:</span>
                    <span className="font-mono">
                      {cacheStats.size}/{cacheStats.maxSize}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 border-t pt-2">
              <button
                onClick={handleReset}
                className="flex-1 rounded bg-surface-3 px-2 py-1 text-xs text-text hover:bg-surface-4"
              >
                Reset
              </button>
              <button
                onClick={handleClearCache}
                className="flex-1 rounded bg-surface-3 px-2 py-1 text-xs text-text hover:bg-surface-4"
              >
                Clear Cache
              </button>
            </div>

            {/* Performance Indicator */}
            <div className="border-t pt-2">
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    metrics.maxRenderTimeMs < 16.67
                      ? 'bg-green-500'
                      : metrics.maxRenderTimeMs < 33.33
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                  }`}
                />
                <span className="text-xs text-text-muted">
                  {metrics.maxRenderTimeMs < 16.67
                    ? '60 FPS'
                    : metrics.maxRenderTimeMs < 33.33
                      ? '30 FPS'
                      : 'Slow'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GripPerformancePanel;
