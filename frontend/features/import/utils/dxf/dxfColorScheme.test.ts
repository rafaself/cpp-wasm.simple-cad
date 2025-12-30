import { describe, it, expect } from 'vitest';
import DxfParser from 'dxf-parser/dist/dxf-parser.js';
import fs from 'fs';
import path from 'path';
import { convertDxfToShapes } from './dxfToShapes';
import { dxfToSvg } from './dxfToSvg';
import { DxfData } from './types';
import { toGrayscale } from './styles';
import { DxfColorScheme } from './colorScheme';

const parser = new DxfParser();
const fixturePath = path.resolve(process.cwd(), 'verification/color-schemes-test.dxf');
const dxfText = fs.readFileSync(fixturePath, 'utf-8');
const fixtureData = parser.parseSync(dxfText) as DxfData;

const baseLayerColor = '#ff0000';
type SchemeCombination = {
  scheme: DxfColorScheme;
  expected: string;
  customColor?: string;
};

const combinations: readonly SchemeCombination[] = [
  { scheme: 'original', expected: baseLayerColor },
  { scheme: 'fixedGray153', expected: '#999999' },
  { scheme: 'grayscale', expected: toGrayscale(baseLayerColor) },
  { scheme: 'custom', expected: '#123456', customColor: '#123456' }
];

describe('DXF Color Scheme Matrix', () => {
  combinations.forEach(({ scheme, expected, customColor }) => {
    it(`applies ${scheme} across shapes import`, () => {
      const shapesResult = convertDxfToShapes(fixtureData, {
        floorId: 'ground',
        defaultLayerId: 'def',
        colorScheme: scheme,
        customColor
      });

      const lineShape = shapesResult.shapes.find(s => s.type === 'line');
      expect(lineShape).toBeDefined();
      expect(lineShape?.strokeColor?.toLowerCase()).toBe(expected);

      if (scheme === 'original') {
        expect(lineShape?.colorMode).toBeUndefined();
      } else {
        expect(lineShape?.colorMode?.fill).toBe('custom');
        expect(lineShape?.colorMode?.stroke).toBe('custom');
      }
    });

    it(`applies ${scheme} across svg import`, () => {
      const svgResult = dxfToSvg(fixtureData, {
        floorId: 'ground',
        defaultLayerId: 'def',
        colorScheme: scheme,
        customColor
      });

      expect(svgResult.svgRaw.toLowerCase()).toContain(`stroke="${expected}"`);
    });
  });
});
