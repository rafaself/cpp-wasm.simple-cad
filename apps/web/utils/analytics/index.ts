/**
 * Ribbon Analytics & Instrumentation
 *
 * Phase 0: Instrumentation + Baseline Measurement
 *
 * @module analytics
 */

export {
  ribbonAnalytics,
  type RibbonEvent,
  type RibbonEventType,
  type RibbonClickEvent,
  type RibbonHoverEvent,
  type RibbonShortcutEvent,
  type RibbonTabSwitchEvent,
  type RibbonAnalyticsReport,
} from './ribbonAnalytics';

export {
  useRibbonTracking,
  useRibbonTabTracking,
  useRibbonMisclickDetector,
  type RibbonTrackingContext,
  type RibbonTrackingHook,
} from './useRibbonTracking';

export {
  ribbonAlignmentAudit,
  formatAlignmentReport,
  exportAlignmentReportJSON,
  installAlignmentAuditDevTools,
  type GroupMeasurements,
  type RibbonAlignmentReport,
} from './ribbonAlignmentAudit';

export {
  generateBaselineReport,
  formatBaselineReport,
  downloadBaselineReport,
  installBaselineReportDevTools,
  type BaselineReport,
} from './ribbonBaselineReport';
