/**
 * DXF Unit Resolution - Scale computation for DXF imports.
 */

import { DxfData, DxfEntity, DxfVector, DxfImportOptions } from './types';

// DXF Unit Codes to Centimeters (CM) Conversion Factors
export const DXF_UNITS: Record<number, number> = {
  1: 2.54, // Inches
  2: 30.48, // Feet
  3: 160934.4, // Miles
  4: 0.1, // Millimeters
  5: 1.0, // Centimeters
  6: 100.0, // Meters
  7: 100000.0, // Kilometers
  8: 0.00000254, // Microinches
  9: 0.00254, // Mils
  10: 91.44, // Yards
  11: 1.0e-8, // Angstroms
  12: 1.0e-7, // Nanometers
  13: 0.0001, // Microns
  14: 10.0, // Decimeters
  15: 1000.0, // Decameters
  16: 10000.0, // Hectometers
  17: 1.0e11, // Gigameters
};

export interface UnitResolverResult {
  globalScale: number;
}

/**
 * Resolve the scale factor for DXF import based on units configuration and heuristics.
 */
export function resolveUnitScale(
  data: DxfData,
  options: DxfImportOptions,
  shouldImportEntity: (e: DxfEntity) => boolean,
): UnitResolverResult {
  const insUnits = data.header?.$INSUNITS;
  let globalScale = 1;

  // If override provided
  if (options.sourceUnits && options.sourceUnits !== 'auto') {
    let sourceToMeters = 1.0;
    switch (options.sourceUnits) {
      case 'meters':
        sourceToMeters = 1.0;
        break;
      case 'cm':
        sourceToMeters = 0.01;
        break;
      case 'mm':
        sourceToMeters = 0.001;
        break;
      case 'feet':
        sourceToMeters = 0.3048;
        break;
      case 'inches':
        sourceToMeters = 0.0254;
        break;
    }
    globalScale = sourceToMeters * 100;
    if (import.meta.env.DEV) {
      console.warn(`DXF Import: Override Units (${options.sourceUnits}). Scale: ${globalScale}`);
    }
  } else {
    // Auto-Detect
    if (insUnits !== undefined && DXF_UNITS[insUnits]) {
      globalScale = DXF_UNITS[insUnits];
    } else {
      // Heuristic for Unitless files
      globalScale = detectUnitlessScale(data, shouldImportEntity);
    }
  }

  return { globalScale };
}

/**
 * Heuristic detection for unitless DXF files by sampling entity bounds.
 */
function detectUnitlessScale(data: DxfData, shouldImportEntity: (e: DxfEntity) => boolean): number {
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let sampleCount = 0;

  const updateBounds = (v: DxfVector) => {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  };

  if (data.entities) {
    for (const e of data.entities) {
      if (!shouldImportEntity(e)) continue;
      if (sampleCount > 1000) break;

      if (e.type === 'LINE' || e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
        e.vertices?.forEach(updateBounds);
        sampleCount++;
      } else if (e.type === 'INSERT' && e.position) {
        updateBounds(e.position);
        sampleCount++;
      } else if (
        (e.type === 'CIRCLE' || e.type === 'ARC') &&
        e.center &&
        typeof e.radius === 'number'
      ) {
        updateBounds({ x: e.center.x - e.radius, y: e.center.y - e.radius });
        updateBounds({ x: e.center.x + e.radius, y: e.center.y + e.radius });
        sampleCount++;
      }
    }
  }

  const extent = Math.max(maxX - minX, maxY - minY);
  if (extent > 0 && extent < 2000) {
    // Heuristic: Small numbers -> Likely Meters
    if (import.meta.env.DEV) {
      console.warn(
        `DXF Import: Auto-detected unitless file with small extents (${extent.toFixed(2)}). Assuming Meters. Scale: 100`,
      );
    }
    return 100;
  }

  // Default to CM (Scale 1)
  return 1;
}
