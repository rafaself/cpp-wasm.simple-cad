/**
 * usePerformanceDevTools - Hook to initialize performance dev tools
 * 
 * Automatically installs performance API in development mode
 * Also optionally shows performance monitor overlay
 * 
 * @example
 * // In App.tsx or main component
 * usePerformanceDevTools({ 
 *   showMonitor: true,
 *   monitorPosition: 'top-right'
 * });
 */

import { useEffect } from 'react';
import { installPerformanceAPI } from '@/utils/dev/performanceAPI';

export interface PerformanceDevToolsConfig {
  /** Install global __perf API in console (default: true in dev) */
  installAPI?: boolean;
  /** Show performance monitor overlay (default: false) */
  showMonitor?: boolean;
  /** Monitor position (default: 'top-right') */
  monitorPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export function usePerformanceDevTools(config: PerformanceDevToolsConfig = {}) {
  const {
    installAPI = import.meta.env.DEV,
    showMonitor = false,
    monitorPosition = 'top-right',
  } = config;

  useEffect(() => {
    if (installAPI) {
      installPerformanceAPI();
    }
  }, [installAPI]);

  return {
    showMonitor,
    monitorPosition,
  };
}
