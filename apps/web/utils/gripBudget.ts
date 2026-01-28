/**
 * Grip Budget System - Progressive disclosure for polygon grips
 *
 * Manages grip visibility based on polygon complexity and zoom level to prevent
 * visual clutter and maintain performance.
 *
 * Phase 3: Performance tuning - CAD-like grip management
 */

import type { ViewTransform } from '@/types';
import type { GripWCS } from '@/engine/core/gripDecoder';

/**
 * Minimum screen distance between grips before applying budget
 * Below this threshold, grips become too dense to interact with
 */
const GRIP_DISPLAY_THRESHOLD_PX = 20;

/**
 * Vertex count thresholds for different grip display modes
 */
const GRIP_BUDGET_THRESHOLDS = {
  /** All grips always visible */
  SHOW_ALL_MAX: 12,
  /** Show vertex grips, hide edge grips by default */
  SHOW_VERTICES_MAX: 24,
  /** Progressive disclosure required */
  PROGRESSIVE_MIN: 25,
};

/**
 * Grip budget strategy based on vertex count
 */
export type GripBudgetStrategy = 'show-all' | 'show-vertices-only' | 'progressive';

/**
 * Result of grip budget calculation
 */
export interface GripBudgetResult {
  strategy: GripBudgetStrategy;
  shouldShowVertexGrips: boolean;
  shouldShowEdgeGrips: boolean;
  /** Indices of grips that should be visible (for progressive mode) */
  visibleGripIndices?: Set<number>;
  /** Reason for budget decision (for debugging) */
  reason: string;
}

/**
 * Calculate average screen-space edge length for a polygon
 */
function calculateAverageScreenEdgeLength(
  grips: GripWCS[],
  viewTransform: ViewTransform,
): number {
  const vertexGrips = grips.filter((g) => g.kind === 'vertex');
  if (vertexGrips.length < 2) return Infinity;

  let totalLength = 0;
  let edgeCount = 0;

  for (let i = 0; i < vertexGrips.length; i++) {
    const next = (i + 1) % vertexGrips.length;
    const v1 = vertexGrips[i]!.positionWCS;
    const v2 = vertexGrips[next]!.positionWCS;

    // Calculate screen-space distance
    const dx = (v2.x - v1.x) * viewTransform.scale;
    const dy = (v2.y - v1.y) * viewTransform.scale;
    const length = Math.sqrt(dx * dx + dy * dy);

    totalLength += length;
    edgeCount++;
  }

  return edgeCount > 0 ? totalLength / edgeCount : Infinity;
}

/**
 * Determine grip budget strategy based on polygon complexity and zoom
 *
 * @param grips All grips for the polygon (vertex + edge)
 * @param viewTransform Current viewport transform
 * @param forceShowAll Override to always show all grips (e.g., explicit edit mode)
 * @returns Grip budget decision
 */
export function calculateGripBudget(
  grips: GripWCS[],
  viewTransform: ViewTransform,
  forceShowAll: boolean = false,
): GripBudgetResult {
  if (grips.length === 0) {
    return {
      strategy: 'show-all',
      shouldShowVertexGrips: false,
      shouldShowEdgeGrips: false,
      reason: 'no-grips',
    };
  }

  // Force show all if requested (e.g., double-click to enter edit mode)
  if (forceShowAll) {
    return {
      strategy: 'show-all',
      shouldShowVertexGrips: true,
      shouldShowEdgeGrips: true,
      reason: 'force-show-all',
    };
  }

  const vertexGrips = grips.filter((g) => g.kind === 'vertex');
  const edgeGrips = grips.filter((g) => g.kind === 'edge-midpoint');
  const vertexCount = vertexGrips.length;

  // Strategy 1: Show all grips (low vertex count)
  if (vertexCount <= GRIP_BUDGET_THRESHOLDS.SHOW_ALL_MAX) {
    return {
      strategy: 'show-all',
      shouldShowVertexGrips: true,
      shouldShowEdgeGrips: true,
      reason: `vertex-count-${vertexCount}`,
    };
  }

  // Strategy 2: Show only vertex grips (medium vertex count)
  if (vertexCount <= GRIP_BUDGET_THRESHOLDS.SHOW_VERTICES_MAX) {
    return {
      strategy: 'show-vertices-only',
      shouldShowVertexGrips: true,
      shouldShowEdgeGrips: false,
      reason: `vertex-count-${vertexCount}`,
    };
  }

  // Strategy 3: Progressive disclosure (high vertex count)
  // Check if zoom level provides enough space for grips
  const avgEdgeLength = calculateAverageScreenEdgeLength(grips, viewTransform);

  if (avgEdgeLength >= GRIP_DISPLAY_THRESHOLD_PX) {
    // Enough screen space - show vertex grips only
    return {
      strategy: 'show-vertices-only',
      shouldShowVertexGrips: true,
      shouldShowEdgeGrips: false,
      reason: `zoom-sufficient-${avgEdgeLength.toFixed(0)}px`,
    };
  }

  // Not enough screen space - progressive disclosure
  // For now, hide all grips and require explicit edit mode
  // Future: Show grips near cursor, or on hover, or selected vertex + neighbors
  return {
    strategy: 'progressive',
    shouldShowVertexGrips: false,
    shouldShowEdgeGrips: false,
    visibleGripIndices: new Set(), // Empty - require explicit edit mode
    reason: `zoom-insufficient-${avgEdgeLength.toFixed(0)}px`,
  };
}

/**
 * Filter grips based on budget decision
 *
 * @param grips All grips
 * @param budget Budget calculation result
 * @returns Filtered grips that should be rendered
 */
export function applyGripBudget(grips: GripWCS[], budget: GripBudgetResult): GripWCS[] {
  if (budget.strategy === 'show-all') {
    return grips;
  }

  if (budget.strategy === 'show-vertices-only') {
    return grips.filter((g) => g.kind === 'vertex');
  }

  if (budget.strategy === 'progressive' && budget.visibleGripIndices) {
    return grips.filter((g) => budget.visibleGripIndices!.has(g.index));
  }

  return [];
}

/**
 * Get grip budget statistics for debugging/monitoring
 */
export interface GripBudgetStats {
  totalGrips: number;
  visibleGrips: number;
  hiddenGrips: number;
  strategy: GripBudgetStrategy;
  avgScreenEdgeLength: number;
  vertexCount: number;
}

export function getGripBudgetStats(
  grips: GripWCS[],
  budget: GripBudgetResult,
  viewTransform: ViewTransform,
): GripBudgetStats {
  const filteredGrips = applyGripBudget(grips, budget);
  const vertexCount = grips.filter((g) => g.kind === 'vertex').length;
  const avgEdgeLength = calculateAverageScreenEdgeLength(grips, viewTransform);

  return {
    totalGrips: grips.length,
    visibleGrips: filteredGrips.length,
    hiddenGrips: grips.length - filteredGrips.length,
    strategy: budget.strategy,
    avgScreenEdgeLength: avgEdgeLength,
    vertexCount,
  };
}
