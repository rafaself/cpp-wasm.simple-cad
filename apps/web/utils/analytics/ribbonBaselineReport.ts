/**
 * Ribbon Baseline Metrics Report
 *
 * Combines analytics data and alignment audit to generate a comprehensive
 * Phase 0 baseline report for the ribbon optimization project.
 *
 * Usage:
 *   const report = await generateBaselineReport()
 *   downloadBaselineReport(report)
 */

import { ribbonAnalytics, RibbonAnalyticsReport } from './ribbonAnalytics'
import { ribbonAlignmentAudit, RibbonAlignmentReport, formatAlignmentReport } from './ribbonAlignmentAudit'

export interface BaselineReport {
  metadata: {
    timestamp: number
    reportVersion: string
    sessionId: string
    userAgent: string
    viewportSize: { width: number; height: number }
  }
  analytics: RibbonAnalyticsReport
  alignment: RibbonAlignmentReport
  summary: {
    // Key metrics for tracking progress
    totalInteractions: number
    topCommands: Array<{ itemId: string; count: number }>
    shortcutUsageRate: number  // % of interactions via shortcuts
    misclickRate: number
    tabSwitchCount: number
    averageHoverDuration: number
    // Alignment metrics
    bodyHeightCompliance: number
    baselineAlignmentRate: number
    spacingVariance: number
    // Overall scores
    discoverabilityScore: number  // 0-100
    efficiencyScore: number  // 0-100
    consistencyScore: number  // 0-100
  }
  recommendations: string[]
}

/**
 * Calculate discoverability score based on hover duration and tooltip views
 */
function calculateDiscoverabilityScore(analytics: RibbonAnalyticsReport): number {
  // Longer average hover = users exploring/discovering
  // More tooltip views = users seeking information
  const hoverScore = Math.min(analytics.averageHoverDuration / 2000, 1) * 50  // Max 50 points
  const tooltipScore = Math.min(analytics.eventCounts.tooltip / analytics.eventCounts.click, 1) * 50  // Max 50 points

  return Math.round(hoverScore + tooltipScore)
}

/**
 * Calculate efficiency score based on shortcut usage and misclick rate
 */
function calculateEfficiencyScore(analytics: RibbonAnalyticsReport): number {
  // Higher shortcut usage = more efficient
  // Lower misclick rate = more efficient
  const totalActions = analytics.eventCounts.click + analytics.eventCounts.shortcut
  const shortcutRate = totalActions > 0 ? analytics.eventCounts.shortcut / totalActions : 0

  const shortcutScore = shortcutRate * 60  // Max 60 points
  const misclickScore = (1 - analytics.misclickRate) * 40  // Max 40 points

  return Math.round(shortcutScore + misclickScore)
}

/**
 * Calculate consistency score based on alignment metrics
 */
function calculateConsistencyScore(alignment: RibbonAlignmentReport): number {
  // Body height compliance
  const bodyScore = (alignment.groupBodyHeights.compliance / 100) * 40  // Max 40 points

  // Baseline alignment
  const baselineScore = (alignment.baselineAlignment.complianceRate / 100) * 30  // Max 30 points

  // Spacing consistency (inverse of variance)
  const maxVariance = 10  // Arbitrary threshold
  const spacingScore = (1 - Math.min(alignment.spacingAnalysis.gapXVariance / maxVariance, 1)) * 30  // Max 30 points

  return Math.round(bodyScore + baselineScore + spacingScore)
}

/**
 * Generate recommendations based on data
 */
function generateRecommendations(report: BaselineReport): string[] {
  const recommendations: string[] = []

  // Alignment recommendations
  if (report.alignment.groupBodyHeights.compliance < 95) {
    recommendations.push(
      `Body height compliance is ${report.alignment.groupBodyHeights.compliance.toFixed(1)}%. ` +
      `Target: 100% of groups at 68px ±2px. Review group CSS and enforce consistent height tokens.`
    )
  }

  if (report.alignment.baselineAlignment.complianceRate < 90) {
    recommendations.push(
      `Baseline alignment is ${report.alignment.baselineAlignment.complianceRate.toFixed(1)}%. ` +
      `Target: 90%+ of elements aligned to 4px grid. Implement baseline grid system.`
    )
  }

  if (report.alignment.spacingAnalysis.gapXVariance > 2) {
    recommendations.push(
      `Gap spacing variance is ${report.alignment.spacingAnalysis.gapXVariance.toFixed(2)}. ` +
      `Target: <1.0. Standardize all gaps to use CSS custom properties (--ribbon-item-gap).`
    )
  }

  // Analytics recommendations
  if (report.analytics.misclickRate > 0.1) {
    recommendations.push(
      `Misclick rate is ${(report.analytics.misclickRate * 100).toFixed(1)}%. ` +
      `Target: <5%. Review command placement and visual hierarchy.`
    )
  }

  const totalActions = report.analytics.eventCounts.click + report.analytics.eventCounts.shortcut
  const shortcutRate = totalActions > 0 ? report.analytics.eventCounts.shortcut / totalActions : 0
  if (shortcutRate < 0.2) {
    recommendations.push(
      `Shortcut usage rate is ${(shortcutRate * 100).toFixed(1)}%. ` +
      `Target: >20%. Improve shortcut discoverability with tooltips and command palette.`
    )
  }

  if (report.analytics.eventCounts.tabSwitch / report.analytics.eventCounts.click > 0.3) {
    recommendations.push(
      `High tab switching rate (${(report.analytics.eventCounts.tabSwitch / report.analytics.eventCounts.click).toFixed(2)} switches per click). ` +
      `Consider reorganizing commands to reduce context switching.`
    )
  }

  // Command distribution recommendations
  const topCommand = report.analytics.topClicks[0]
  if (topCommand && topCommand.count > report.analytics.eventCounts.click * 0.3) {
    recommendations.push(
      `Command "${topCommand.itemId}" accounts for ${((topCommand.count / report.analytics.eventCounts.click) * 100).toFixed(1)}% of clicks. ` +
      `Consider making this command more prominent or providing quick access.`
    )
  }

  return recommendations
}

/**
 * Generate comprehensive baseline report
 */
export async function generateBaselineReport(): Promise<BaselineReport> {
  // Get analytics data
  const analyticsReport = ribbonAnalytics.getReport()

  // Run alignment audit
  const alignmentReport = await ribbonAlignmentAudit()

  // Calculate scores
  const discoverabilityScore = calculateDiscoverabilityScore(analyticsReport)
  const efficiencyScore = calculateEfficiencyScore(analyticsReport)
  const consistencyScore = calculateConsistencyScore(alignmentReport)

  // Calculate shortcut usage rate
  const totalActions = analyticsReport.eventCounts.click + analyticsReport.eventCounts.shortcut
  const shortcutUsageRate = totalActions > 0
    ? analyticsReport.eventCounts.shortcut / totalActions
    : 0

  // Create report
  const report: BaselineReport = {
    metadata: {
      timestamp: Date.now(),
      reportVersion: '1.0.0',
      sessionId: analyticsReport.sessionId,
      userAgent: navigator.userAgent,
      viewportSize: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    },
    analytics: analyticsReport,
    alignment: alignmentReport,
    summary: {
      totalInteractions: analyticsReport.totalEvents,
      topCommands: analyticsReport.topClicks.slice(0, 5),
      shortcutUsageRate,
      misclickRate: analyticsReport.misclickRate,
      tabSwitchCount: analyticsReport.eventCounts.tabSwitch,
      averageHoverDuration: analyticsReport.averageHoverDuration,
      bodyHeightCompliance: alignmentReport.groupBodyHeights.compliance,
      baselineAlignmentRate: alignmentReport.baselineAlignment.complianceRate,
      spacingVariance: alignmentReport.spacingAnalysis.gapXVariance,
      discoverabilityScore,
      efficiencyScore,
      consistencyScore
    },
    recommendations: []
  }

  // Generate recommendations
  report.recommendations = generateRecommendations(report)

  return report
}

/**
 * Format baseline report as readable text
 */
export function formatBaselineReport(report: BaselineReport): string {
  const lines: string[] = []

  lines.push('='.repeat(80))
  lines.push(' '.repeat(20) + 'RIBBON BASELINE REPORT - PHASE 0')
  lines.push('='.repeat(80))
  lines.push('')
  lines.push(`Generated: ${new Date(report.metadata.timestamp).toISOString()}`)
  lines.push(`Session ID: ${report.metadata.sessionId}`)
  lines.push(`Report Version: ${report.metadata.reportVersion}`)
  lines.push(`Viewport: ${report.metadata.viewportSize.width}×${report.metadata.viewportSize.height}`)
  lines.push('')

  lines.push('─'.repeat(80))
  lines.push('EXECUTIVE SUMMARY')
  lines.push('─'.repeat(80))
  lines.push('')
  lines.push(`Total Interactions: ${report.summary.totalInteractions}`)
  lines.push(`Session Duration: ${report.analytics.sessionDuration.toFixed(1)} minutes`)
  lines.push(`Tab Switches: ${report.summary.tabSwitchCount}`)
  lines.push('')
  lines.push('KEY METRICS:')
  lines.push(`  Discoverability Score:  ${report.summary.discoverabilityScore}/100`)
  lines.push(`  Efficiency Score:       ${report.summary.efficiencyScore}/100`)
  lines.push(`  Consistency Score:      ${report.summary.consistencyScore}/100`)
  lines.push('')

  lines.push('─'.repeat(80))
  lines.push('USAGE ANALYTICS')
  lines.push('─'.repeat(80))
  lines.push('')
  lines.push(`Clicks: ${report.analytics.eventCounts.click}`)
  lines.push(`Shortcuts: ${report.analytics.eventCounts.shortcut}`)
  lines.push(`Shortcut Usage Rate: ${(report.summary.shortcutUsageRate * 100).toFixed(1)}%`)
  lines.push(`Misclick Rate: ${(report.summary.misclickRate * 100).toFixed(1)}%`)
  lines.push(`Average Hover Duration: ${report.summary.averageHoverDuration.toFixed(0)}ms`)
  lines.push('')
  lines.push('TOP 5 COMMANDS:')
  report.summary.topCommands.forEach((cmd, i) => {
    lines.push(`  ${i + 1}. ${cmd.itemId}: ${cmd.count} clicks`)
  })
  lines.push('')

  lines.push('─'.repeat(80))
  lines.push('VISUAL CONSISTENCY')
  lines.push('─'.repeat(80))
  lines.push('')
  lines.push(`Total Groups: ${report.alignment.totalGroups}`)
  lines.push(`Total Tabs: ${report.alignment.totalTabs}`)
  lines.push('')
  lines.push(`Body Height Compliance: ${report.summary.bodyHeightCompliance.toFixed(1)}%`)
  lines.push(`  Target: 68px ±2px`)
  lines.push(`  Range: ${report.alignment.groupBodyHeights.min.toFixed(1)}px - ${report.alignment.groupBodyHeights.max.toFixed(1)}px`)
  lines.push(`  Variance: ${report.alignment.groupBodyHeights.variance.toFixed(2)}`)
  lines.push('')
  lines.push(`Baseline Alignment: ${report.summary.baselineAlignmentRate.toFixed(1)}%`)
  lines.push(`  Target: 90%+ on 4px grid`)
  lines.push(`  Max Deviation: ${report.alignment.baselineAlignment.maxDeviation.toFixed(2)}px`)
  lines.push('')
  lines.push(`Spacing Variance: ${report.summary.spacingVariance.toFixed(2)}`)
  lines.push(`  Target Gap: ${report.alignment.spacingAnalysis.targetGap}px`)
  lines.push(`  Target Padding: ${report.alignment.spacingAnalysis.targetPadding}px`)
  lines.push('')

  if (report.recommendations.length > 0) {
    lines.push('─'.repeat(80))
    lines.push('RECOMMENDATIONS')
    lines.push('─'.repeat(80))
    lines.push('')
    report.recommendations.forEach((rec, i) => {
      lines.push(`${i + 1}. ${rec}`)
      lines.push('')
    })
  }

  lines.push('─'.repeat(80))
  lines.push('DETAILED ALIGNMENT REPORT')
  lines.push('─'.repeat(80))
  lines.push('')
  lines.push(formatAlignmentReport(report.alignment))
  lines.push('')

  lines.push('='.repeat(80))
  lines.push('END OF BASELINE REPORT')
  lines.push('='.repeat(80))

  return lines.join('\n')
}

/**
 * Download baseline report as file
 */
export function downloadBaselineReport(report: BaselineReport, format: 'json' | 'txt' = 'json'): void {
  const timestamp = new Date(report.metadata.timestamp).toISOString().replace(/[:.]/g, '-')
  const filename = `ribbon-baseline-report-${timestamp}.${format}`

  let content: string
  let mimeType: string

  if (format === 'json') {
    content = JSON.stringify(report, null, 2)
    mimeType = 'application/json'
  } else {
    content = formatBaselineReport(report)
    mimeType = 'text/plain'
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()

  URL.revokeObjectURL(url)
}

/**
 * Install dev tools
 */
export function installBaselineReportDevTools(): void {
  if (typeof window === 'undefined') return

  (window as any).__ribbonBaseline = {
    generate: async () => {
      const report = await generateBaselineReport()
      console.log(formatBaselineReport(report))
      return report
    },
    generateAndDownload: async (format: 'json' | 'txt' = 'json') => {
      const report = await generateBaselineReport()
      downloadBaselineReport(report, format)
      return report
    },
    quickSummary: async () => {
      const report = await generateBaselineReport()
      console.log(`
Discoverability: ${report.summary.discoverabilityScore}/100
Efficiency: ${report.summary.efficiencyScore}/100
Consistency: ${report.summary.consistencyScore}/100

Top Command: ${report.summary.topCommands[0]?.itemId || 'N/A'} (${report.summary.topCommands[0]?.count || 0} clicks)
Shortcut Usage: ${(report.summary.shortcutUsageRate * 100).toFixed(1)}%
Body Height Compliance: ${report.summary.bodyHeightCompliance.toFixed(1)}%

Recommendations: ${report.recommendations.length}
      `)
      return report
    }
  }

  console.log('[RibbonBaseline] Dev tools installed: window.__ribbonBaseline')
  console.log('  - generate(): Generate and print full report')
  console.log('  - generateAndDownload(format): Generate and download report')
  console.log('  - quickSummary(): Show quick summary')
}

// Auto-install in development
if (import.meta.env.DEV) {
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      installBaselineReportDevTools()
    }, 1000)
  }
}
