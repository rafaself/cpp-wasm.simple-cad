/**
 * Ribbon Visual Alignment Audit Utility
 *
 * Measures visual consistency, alignment, and spacing in the ribbon UI.
 * Generates detailed reports for Phase 0 baseline measurement.
 *
 * Usage:
 *   const audit = await ribbonAlignmentAudit()
 *   console.table(audit.groups)
 */

export interface GroupMeasurements {
  groupId: string;
  groupLabel: string;
  tabId: string;
  // Body measurements
  bodyHeight: number;
  bodyWidth: number;
  // Label measurements
  labelHeight: number;
  labelFontSize: number;
  labelLineHeight: number;
  // Spacing
  itemCount: number;
  gapX: number | null; // Gap between items
  gapY: number | null;
  paddingX: number;
  paddingY: number;
  // Alignment
  itemHeights: number[];
  itemWidths: number[];
  baselineOffsets: number[]; // Distance from 4px grid
}

export interface RibbonAlignmentReport {
  timestamp: number;
  // Summary metrics
  totalGroups: number;
  totalTabs: number;
  // Height consistency
  groupBodyHeights: {
    values: number[];
    min: number;
    max: number;
    variance: number;
    target: number;
    compliance: number; // % within ±2px of target
  };
  groupLabelHeights: {
    values: number[];
    min: number;
    max: number;
    variance: number;
    target: number;
    compliance: number;
  };
  // Spacing consistency
  spacingAnalysis: {
    gapXValues: number[];
    gapXVariance: number;
    paddingXValues: number[];
    paddingXVariance: number;
    targetGap: number;
    targetPadding: number;
  };
  // Baseline alignment
  baselineAlignment: {
    compliant: number; // Count of items on 4px grid
    nonCompliant: number;
    complianceRate: number;
    maxDeviation: number;
  };
  // Detailed per-group measurements
  groups: GroupMeasurements[];
}

/**
 * Measure a single element's dimensions and position
 */
function measureElement(element: Element): DOMRect {
  return element.getBoundingClientRect();
}

/**
 * Get computed style value as number (strips 'px')
 */
function getStyleNumber(element: Element, property: string): number {
  const value = window.getComputedStyle(element).getPropertyValue(property);
  return parseFloat(value) || 0;
}

/**
 * Calculate variance of a number array
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Check if a value is within tolerance of target
 */
function isWithinTolerance(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
}

/**
 * Get the tab ID from a group element
 */
function getTabIdForGroup(groupElement: Element): string {
  // Walk up to find the tabpanel
  let current: Element | null = groupElement.parentElement;
  while (current) {
    if (current.getAttribute('role') === 'tabpanel') {
      const panelId = current.getAttribute('id');
      if (panelId) {
        // Extract tab ID from panel-{tabId}
        return panelId.replace('panel-', '');
      }
    }
    current = current.parentElement;
  }
  return 'unknown';
}

/**
 * Measure a single ribbon group
 */
function measureGroup(groupElement: Element): GroupMeasurements | null {
  try {
    // Find group body and label
    const bodyElement = groupElement.querySelector('.ribbon-group-body');
    const labelElement = groupElement.querySelector('.ribbon-group-label');

    if (!bodyElement || !labelElement) {
      console.warn('Missing body or label in group:', groupElement);
      return null;
    }

    // Basic measurements
    const bodyRect = measureElement(bodyElement);
    const labelRect = measureElement(labelElement);

    // Get label text
    const labelText = labelElement.textContent?.trim() || 'Unknown';

    // Get tab ID
    const tabId = getTabIdForGroup(groupElement);

    // Get group ID from the element's structure
    const groupId =
      (groupElement as HTMLElement).dataset.groupId || labelText.toLowerCase().replace(/\s+/g, '-');

    // Measure items
    const items = Array.from(bodyElement.querySelectorAll('button, .ribbon-control'));
    const itemHeights = items.map((item) => measureElement(item).height);
    const itemWidths = items.map((item) => measureElement(item).width);

    // Calculate baseline offsets (modulo 4px grid)
    const baselineOffsets = items.map((item) => {
      const rect = measureElement(item);
      const topOffset = rect.top % 4;
      return topOffset;
    });

    // Get spacing from computed styles
    const bodyStyle = window.getComputedStyle(bodyElement);
    const bodyGroupStyle = window.getComputedStyle(bodyElement.firstElementChild || bodyElement);

    const gapX = getStyleNumber(bodyElement.firstElementChild || bodyElement, 'column-gap');
    const gapY = getStyleNumber(bodyElement.firstElementChild || bodyElement, 'row-gap');
    const paddingX = getStyleNumber(bodyElement, 'padding-left');
    const paddingY = getStyleNumber(bodyElement, 'padding-top');

    // Label font measurements
    const labelStyle = window.getComputedStyle(labelElement);
    const labelFontSize = getStyleNumber(labelElement, 'font-size');
    const labelLineHeight = getStyleNumber(labelElement, 'line-height');

    return {
      groupId,
      groupLabel: labelText,
      tabId,
      bodyHeight: bodyRect.height,
      bodyWidth: bodyRect.width,
      labelHeight: labelRect.height,
      labelFontSize,
      labelLineHeight,
      itemCount: items.length,
      gapX: gapX || null,
      gapY: gapY || null,
      paddingX,
      paddingY,
      itemHeights,
      itemWidths,
      baselineOffsets,
    };
  } catch (error) {
    console.error('Error measuring group:', error);
    return null;
  }
}

/**
 * Run alignment audit on the ribbon
 */
export async function ribbonAlignmentAudit(): Promise<RibbonAlignmentReport> {
  // Find all ribbon groups
  const groupElements = Array.from(document.querySelectorAll('.ribbon-group'));

  if (groupElements.length === 0) {
    throw new Error('No ribbon groups found. Is the ribbon rendered?');
  }

  // Measure all groups
  const measurements = groupElements
    .map(measureGroup)
    .filter((m): m is GroupMeasurements => m !== null);

  if (measurements.length === 0) {
    throw new Error('Failed to measure any groups');
  }

  // Extract values for analysis
  const bodyHeights = measurements.map((m) => m.bodyHeight);
  const labelHeights = measurements.map((m) => m.labelHeight);
  const gapXValues = measurements.map((m) => m.gapX).filter((v): v is number => v !== null);
  const paddingXValues = measurements.map((m) => m.paddingX);

  // Baseline alignment analysis
  const allBaselineOffsets = measurements.flatMap((m) => m.baselineOffsets);
  const compliantBaselines = allBaselineOffsets.filter((offset) => Math.abs(offset) < 0.5).length;
  const nonCompliantBaselines = allBaselineOffsets.length - compliantBaselines;
  const maxBaselineDeviation = Math.max(...allBaselineOffsets.map(Math.abs));

  // Target values from design tokens
  const TARGET_BODY_HEIGHT = 68;
  const TARGET_LABEL_HEIGHT = 18;
  const TARGET_GAP = 4;
  const TARGET_PADDING = 12;

  // Calculate compliance
  const bodyHeightCompliance =
    bodyHeights.filter((h) => isWithinTolerance(h, TARGET_BODY_HEIGHT, 2)).length /
    bodyHeights.length;

  const labelHeightCompliance =
    labelHeights.filter((h) => isWithinTolerance(h, TARGET_LABEL_HEIGHT, 2)).length /
    labelHeights.length;

  // Count unique tabs
  const uniqueTabs = new Set(measurements.map((m) => m.tabId));

  return {
    timestamp: Date.now(),
    totalGroups: measurements.length,
    totalTabs: uniqueTabs.size,
    groupBodyHeights: {
      values: bodyHeights,
      min: Math.min(...bodyHeights),
      max: Math.max(...bodyHeights),
      variance: calculateVariance(bodyHeights),
      target: TARGET_BODY_HEIGHT,
      compliance: bodyHeightCompliance * 100,
    },
    groupLabelHeights: {
      values: labelHeights,
      min: Math.min(...labelHeights),
      max: Math.max(...labelHeights),
      variance: calculateVariance(labelHeights),
      target: TARGET_LABEL_HEIGHT,
      compliance: labelHeightCompliance * 100,
    },
    spacingAnalysis: {
      gapXValues,
      gapXVariance: calculateVariance(gapXValues),
      paddingXValues,
      paddingXVariance: calculateVariance(paddingXValues),
      targetGap: TARGET_GAP,
      targetPadding: TARGET_PADDING,
    },
    baselineAlignment: {
      compliant: compliantBaselines,
      nonCompliant: nonCompliantBaselines,
      complianceRate:
        allBaselineOffsets.length > 0 ? (compliantBaselines / allBaselineOffsets.length) * 100 : 0,
      maxDeviation: maxBaselineDeviation,
    },
    groups: measurements,
  };
}

/**
 * Format audit report as readable text
 */
export function formatAlignmentReport(report: RibbonAlignmentReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('RIBBON ALIGNMENT AUDIT REPORT');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Timestamp: ${new Date(report.timestamp).toISOString()}`);
  lines.push(`Total Groups: ${report.totalGroups}`);
  lines.push(`Total Tabs: ${report.totalTabs}`);
  lines.push('');

  lines.push('─'.repeat(60));
  lines.push('GROUP BODY HEIGHT');
  lines.push('─'.repeat(60));
  lines.push(`Target: ${report.groupBodyHeights.target}px`);
  lines.push(
    `Range: ${report.groupBodyHeights.min.toFixed(1)}px - ${report.groupBodyHeights.max.toFixed(1)}px`,
  );
  lines.push(`Variance: ${report.groupBodyHeights.variance.toFixed(2)}`);
  lines.push(`Compliance: ${report.groupBodyHeights.compliance.toFixed(1)}% (within ±2px)`);
  lines.push(`Status: ${report.groupBodyHeights.compliance >= 95 ? '✓ PASS' : '✗ FAIL'}`);
  lines.push('');

  lines.push('─'.repeat(60));
  lines.push('GROUP LABEL HEIGHT');
  lines.push('─'.repeat(60));
  lines.push(`Target: ${report.groupLabelHeights.target}px`);
  lines.push(
    `Range: ${report.groupLabelHeights.min.toFixed(1)}px - ${report.groupLabelHeights.max.toFixed(1)}px`,
  );
  lines.push(`Variance: ${report.groupLabelHeights.variance.toFixed(2)}`);
  lines.push(`Compliance: ${report.groupLabelHeights.compliance.toFixed(1)}% (within ±2px)`);
  lines.push(`Status: ${report.groupLabelHeights.compliance >= 95 ? '✓ PASS' : '✗ FAIL'}`);
  lines.push('');

  lines.push('─'.repeat(60));
  lines.push('SPACING CONSISTENCY');
  lines.push('─'.repeat(60));
  lines.push(`Gap X Target: ${report.spacingAnalysis.targetGap}px`);
  lines.push(`Gap X Variance: ${report.spacingAnalysis.gapXVariance.toFixed(2)}`);
  lines.push(`Padding X Target: ${report.spacingAnalysis.targetPadding}px`);
  lines.push(`Padding X Variance: ${report.spacingAnalysis.paddingXVariance.toFixed(2)}`);
  lines.push('');

  lines.push('─'.repeat(60));
  lines.push('BASELINE ALIGNMENT (4px Grid)');
  lines.push('─'.repeat(60));
  lines.push(`Compliant Items: ${report.baselineAlignment.compliant}`);
  lines.push(`Non-Compliant Items: ${report.baselineAlignment.nonCompliant}`);
  lines.push(`Compliance Rate: ${report.baselineAlignment.complianceRate.toFixed(1)}%`);
  lines.push(`Max Deviation: ${report.baselineAlignment.maxDeviation.toFixed(2)}px`);
  lines.push(`Status: ${report.baselineAlignment.complianceRate >= 90 ? '✓ PASS' : '✗ FAIL'}`);
  lines.push('');

  lines.push('─'.repeat(60));
  lines.push('PER-GROUP DETAILS');
  lines.push('─'.repeat(60));
  report.groups.forEach((group) => {
    lines.push(`${group.groupLabel} (${group.tabId})`);
    lines.push(`  Body: ${group.bodyHeight.toFixed(1)}px × ${group.bodyWidth.toFixed(1)}px`);
    lines.push(`  Label: ${group.labelHeight.toFixed(1)}px`);
    lines.push(`  Items: ${group.itemCount}`);
    lines.push(`  Gap: ${group.gapX?.toFixed(1) || 'N/A'}px`);
    lines.push('');
  });

  lines.push('='.repeat(60));
  lines.push('END OF REPORT');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * Export report to JSON
 */
export function exportAlignmentReportJSON(report: RibbonAlignmentReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Install dev tools for alignment audit
 */
export function installAlignmentAuditDevTools(): void {
  if (typeof window === 'undefined') return;

  (window as any).__ribbonAlignmentAudit = {
    run: async () => {
      const report = await ribbonAlignmentAudit();
      console.log(formatAlignmentReport(report));
      return report;
    },
    runAndExport: async () => {
      const report = await ribbonAlignmentAudit();
      return exportAlignmentReportJSON(report);
    },
    runAndTable: async () => {
      const report = await ribbonAlignmentAudit();
      console.table(report.groups);
      console.log(`\nBody Height Compliance: ${report.groupBodyHeights.compliance.toFixed(1)}%`);
      console.log(`Baseline Alignment: ${report.baselineAlignment.complianceRate.toFixed(1)}%`);
      return report;
    },
  };

  console.log('[RibbonAlignmentAudit] Dev tools installed: window.__ribbonAlignmentAudit');
  console.log('  - run(): Run audit and print formatted report');
  console.log('  - runAndExport(): Run audit and export JSON');
  console.log('  - runAndTable(): Run audit and show table view');
}

// Auto-install in development
if (import.meta.env.DEV) {
  if (typeof window !== 'undefined') {
    // Install after a short delay to ensure DOM is ready
    setTimeout(() => {
      installAlignmentAuditDevTools();
    }, 1000);
  }
}
