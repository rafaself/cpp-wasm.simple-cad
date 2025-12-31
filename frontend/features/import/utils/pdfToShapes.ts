import * as pdfjs from 'pdfjs-dist';

import { createLogger } from '@/utils/logger';

import { Shape, Point, NormalizedViewBox } from '../../../types';
import { generateId } from '../../../utils/uuid';

import { applyColorScheme, resolveColorScheme, type DxfColorScheme } from './dxf/colorScheme';
import {
  Matrix,
  IDENTITY_MATRIX,
  multiplyMatrix,
  applyMatrix,
  formatColor,
  isNearWhiteHex,
} from './pdfMatrixUtils';

const isDevEnv = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
const CTM_TRANSLATION_WARN = 1_000_000,
  CTM_SCALE_WARN = 10_000;
const logger = createLogger('pdfToShapes', { minLevel: 'warn' });

interface PdfImportColorOptions {
  colorScheme?: DxfColorScheme;
  customColor?: string;
}
interface GraphicsState {
  ctm: Matrix;
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
}

export const convertPdfPageToShapes = async (
  page: any,
  floorId: string,
  layerId: string,
  options?: PdfImportColorOptions,
): Promise<Shape[]> => {
  const colorPrefs = resolveColorScheme(options);
  const applyScheme = (base: string): string =>
    applyColorScheme(base, colorPrefs.scheme, colorPrefs.customColor);
  const opList = await page.getOperatorList();
  const viewport = page.getViewport({ scale: 1.0 }); // 1pt = 1px, usually

  const viewportMatrix: Matrix = viewport.transform;

  const shapes: Shape[] = [];

  const stateStack: GraphicsState[] = [];
  let currentState: GraphicsState = {
    ctm: IDENTITY_MATRIX,
    strokeColor: applyScheme('#000000'),
    fillColor: applyScheme('#000000'),
    lineWidth: 1,
  };

  let currentPath: string[] = [];
  let currentStartPoint: Point = { x: 0, y: 0 }; // For closePath
  let currentPoint: Point = { x: 0, y: 0 };

  let pathSegments: { type: 'M' | 'L' | 'C' | 'Z'; points: Point[] }[] = [];

  const { fnArray, argsArray } = opList;

  try {
    const textContent = await page.getTextContent();
    const textItems: any[] = [];
    const viewportScale = Math.sqrt(
      viewportMatrix[0] * viewportMatrix[0] + viewportMatrix[1] * viewportMatrix[1],
    );

    for (const item of textContent.items) {
      if ('str' in item) {
        if (item.str.trim().length === 0 && item.width === 0) continue;

        const textMatrix: Matrix = item.transform;
        const totalMatrix = multiplyMatrix(textMatrix, viewportMatrix);

        const totalA = totalMatrix[0];
        const totalB = totalMatrix[1];
        const rotation = Math.atan2(totalB, totalA);

        const totalC = totalMatrix[2];
        const totalD = totalMatrix[3];
        const globalScaleY = Math.sqrt(totalC * totalC + totalD * totalD);

        let fontSize = globalScaleY;
        if (fontSize < 0.1) fontSize = 12;

        const width = item.width * viewportScale;
        const p_base = { x: totalMatrix[4], y: totalMatrix[5] };

        textItems.push({
          str: item.str,
          x: p_base.x,
          y: p_base.y,
          width: width,
          fontSize: fontSize,
          rotation: rotation,
          origY: p_base.y,
        });
      }
    }

    textItems.sort((a, b) => {
      if (Math.abs(a.rotation - b.rotation) > 0.01) {
        return a.y - b.y;
      }
      const avgFontSize = (a.fontSize + b.fontSize) / 2;
      const yTolerance = avgFontSize * 0.2;
      if (Math.abs(a.y - b.y) > yTolerance) {
        return a.y - b.y;
      }
      return a.x - b.x;
    });

    const mergedItems: any[] = [];
    if (textItems.length > 0) {
      let current = textItems[0];
      for (let k = 1; k < textItems.length; k++) {
        const next = textItems[k];

        const avgFontSize = (current.fontSize + next.fontSize) / 2;
        const yTolerance = avgFontSize * 0.2;
        const sameLine = Math.abs(current.y - next.y) < yTolerance;

        const isRotated = Math.abs(current.rotation) > 0.01;
        let shouldMerge = false;

        if (sameLine && Math.abs(current.rotation - next.rotation) < 0.01 && !isRotated) {
          const gap = next.x - (current.x + current.width);
          const maxGap = current.fontSize * 1.5;
          const bothNumbers =
            /^[0-9.]+$/.test(current.str.trim()) && /^[0-9.]+$/.test(next.str.trim());
          const safeGap = bothNumbers ? current.fontSize * 0.5 : maxGap;
          shouldMerge = gap > -current.fontSize * 0.5 && gap < safeGap;
        }

        if (shouldMerge) {
          const gap = next.x - (current.x + current.width);
          if (gap > current.fontSize * 0.1) current.str += ' ';
          else current.str += '';
          current.str += next.str;
          current.width += gap + next.width;
        } else {
          mergedItems.push(current);
          current = next;
        }
      }
      mergedItems.push(current);
    }

    mergedItems.forEach((item) => {
      const finalRotation = -item.rotation;

      shapes.push({
        id: generateId('pdf-text'),
        type: 'text',
        x: item.x,
        y: item.y,
        textContent: item.str,
        fontSize: item.fontSize || 12,
        fontFamily: 'sans-serif',
        strokeColor: applyScheme('#000000'),
        strokeWidth: 1,
        strokeEnabled: true,
        fillColor: 'transparent',
        fillEnabled: false,
        colorMode: { fill: 'custom', stroke: 'custom' },
        rotation: finalRotation,
        points: [],
        layerId,
        floorId,
        discipline: 'architecture',
      });
    });
  } catch (e) {
    logger.warn('Error extracting text content', e);
  }

  const OPS = pdfjs.OPS;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    switch (fn) {
      case OPS.save: // q
        stateStack.push({ ...currentState });
        break;

      case OPS.restore: // Q
        if (stateStack.length > 0) {
          currentState = stateStack.pop()!;
        }
        break;

      case OPS.transform:
        const [a, b, c, d, e, f] = args;
        const incomingMatrix: Matrix = [a, b, c, d, e, f];
        const nextCtm = multiplyMatrix(incomingMatrix, currentState.ctm);

        if (isDevEnv) {
          const translationMagnitude = Math.hypot(nextCtm[4], nextCtm[5]);
          const maxScale = Math.max(Math.abs(nextCtm[0]), Math.abs(nextCtm[3]));
          if (
            !Number.isFinite(translationMagnitude) ||
            !Number.isFinite(maxScale) ||
            translationMagnitude > CTM_TRANSLATION_WARN ||
            maxScale > CTM_SCALE_WARN
          ) {
            logger.warn('Suspicious CTM after transform', {
              applied: incomingMatrix,
              resulting: nextCtm,
            });
          }
        }

        currentState.ctm = nextCtm;
        break;

      case OPS.setLineWidth:
        const wVal = args[0];
        currentState.lineWidth = wVal <= 0 ? 0.05 : wVal;
        break;

      case OPS.setStrokeColor:
      case OPS.setStrokeRGBColor:
      case OPS.setStrokeGray:
      case OPS.setStrokeCMYKColor:
        currentState.strokeColor = applyScheme(formatColor(args));
        break;

      case OPS.setFillColor:
      case OPS.setFillRGBColor:
      case OPS.setFillGray:
      case OPS.setFillCMYKColor:
        const fillHex = formatColor(args);
        currentState.fillColor = isNearWhiteHex(fillHex) ? 'transparent' : applyScheme(fillHex);
        break;

      case OPS.constructPath:
        const pathOps = args[0];
        const pathData = args[1];
        let dIndex = 0;
        for (let j = 0; j < pathOps.length; j++) {
          const op = pathOps[j];

          if (pathSegments.length === 0 && op !== OPS.moveTo && op !== OPS.rectangle) {
            const p0 = currentPoint;
            currentPath.push(`M ${p0.x} ${p0.y}`);
            currentStartPoint = p0;
            pathSegments.push({ type: 'M', points: [p0] });
          }

          switch (op) {
            case OPS.moveTo:
              const p0 = applyMatrix(
                { x: pathData[dIndex], y: pathData[dIndex + 1] },
                currentState.ctm,
              );
              currentPath.push(`M ${p0.x} ${p0.y}`);
              currentPoint = p0;
              currentStartPoint = p0;
              pathSegments.push({ type: 'M', points: [p0] });
              dIndex += 2;
              break;
            case OPS.lineTo:
              const p1 = applyMatrix(
                { x: pathData[dIndex], y: pathData[dIndex + 1] },
                currentState.ctm,
              );
              currentPath.push(`L ${p1.x} ${p1.y}`);
              currentPoint = p1;
              pathSegments.push({ type: 'L', points: [p1] });
              dIndex += 2;
              break;
            case OPS.curveTo:
              const c1 = applyMatrix(
                { x: pathData[dIndex], y: pathData[dIndex + 1] },
                currentState.ctm,
              );
              const c2 = applyMatrix(
                { x: pathData[dIndex + 2], y: pathData[dIndex + 3] },
                currentState.ctm,
              );
              const p2 = applyMatrix(
                { x: pathData[dIndex + 4], y: pathData[dIndex + 5] },
                currentState.ctm,
              );
              currentPath.push(`C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`);
              currentPoint = p2;
              pathSegments.push({ type: 'C', points: [c1, c2, p2] });
              dIndex += 6;
              break;
            case OPS.rectangle:
              const rx = pathData[dIndex];
              const ry = pathData[dIndex + 1];
              const rw = pathData[dIndex + 2];
              const rh = pathData[dIndex + 3];
              const r1 = applyMatrix({ x: rx, y: ry }, currentState.ctm);
              const r2 = applyMatrix({ x: rx + rw, y: ry }, currentState.ctm);
              const r3 = applyMatrix({ x: rx + rw, y: ry + rh }, currentState.ctm);
              const r4 = applyMatrix({ x: rx, y: ry + rh }, currentState.ctm);

              currentPath.push(
                `M ${r1.x} ${r1.y} L ${r2.x} ${r2.y} L ${r3.x} ${r3.y} L ${r4.x} ${r4.y} Z`,
              );
              pathSegments = [
                { type: 'M', points: [r1] },
                { type: 'L', points: [r2] },
                { type: 'L', points: [r3] },
                { type: 'L', points: [r4] },
                { type: 'Z', points: [] },
              ];
              dIndex += 4;
              break;
            case OPS.closePath:
              currentPath.push('Z');
              pathSegments.push({ type: 'Z', points: [] });
              break;
          }
        }
        break;

      case OPS.stroke:
      case OPS.fill:
      case OPS.eoFill:
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        if (pathSegments.length === 0) break;

        const finalSegments = pathSegments.map((seg) => ({
          ...seg,
          points: seg.points.map((p) => applyMatrix(p, viewportMatrix)),
        }));

        const isClosed =
          finalSegments[finalSegments.length - 1].type === 'Z' ||
          [OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(fn);

        const isStroke = [
          OPS.stroke,
          OPS.fillStroke,
          OPS.eoFillStroke,
          OPS.closeStroke,
          OPS.closeFillStroke,
          OPS.closeEOFillStroke,
        ].includes(fn);
        const isFill = [
          OPS.fill,
          OPS.eoFill,
          OPS.fillStroke,
          OPS.eoFillStroke,
          OPS.closeFillStroke,
          OPS.closeEOFillStroke,
        ].includes(fn);

        if (
          finalSegments.length === 2 &&
          finalSegments[0].type === 'M' &&
          finalSegments[1].type === 'L' &&
          !isFill
        ) {
          shapes.push({
            id: generateId('pdf-line'),
            type: 'line',
            points: [finalSegments[0].points[0], finalSegments[1].points[0]],
            strokeColor: currentState.strokeColor,
            strokeWidth: Math.max(currentState.lineWidth * viewportMatrix[0], 1), // Force min 1px
            strokeEnabled: true,
            fillColor: 'transparent',
            fillEnabled: false,
            colorMode: { fill: 'custom', stroke: 'custom' },
            layerId,
            floorId,
            discipline: 'architecture',
          });
        } else if (finalSegments.every((s) => s.type === 'M' || s.type === 'L' || s.type === 'Z')) {
          const subpaths: Point[][] = [];
          let currentSubpath: Point[] = [];

          finalSegments.forEach((s) => {
            if (s.type === 'M') {
              if (currentSubpath.length > 0) {
                subpaths.push(currentSubpath);
                currentSubpath = [];
              }
              if (s.points.length > 0) {
                currentSubpath.push(s.points[0]);
              }
            } else if (s.type === 'L' && s.points.length > 0) {
              currentSubpath.push(s.points[0]);
            } else if (s.type === 'Z' && currentSubpath.length > 0) {
              const first = currentSubpath[0];
              const last = currentSubpath[currentSubpath.length - 1];
              const dist = Math.sqrt(Math.pow(first.x - last.x, 2) + Math.pow(first.y - last.y, 2));
              if (dist > 0.001) {
                currentSubpath.push({ ...first });
              }
            }
          });

          if (currentSubpath.length > 0) {
            subpaths.push(currentSubpath);
          }

          subpaths.forEach((points) => {
            if (points.length < 2) return;

            if (isFill) {
              createSvgShapeFromPoints(points);
            } else if (isStroke) {
              shapes.push({
                id: generateId('pdf-poly'),
                type: 'polyline',
                points: points,
                strokeColor: currentState.strokeColor,
                strokeWidth: Math.max(currentState.lineWidth * viewportMatrix[0], 1),
                strokeEnabled: true,
                fillColor: 'transparent',
                fillEnabled: false,
                colorMode: { fill: 'custom', stroke: 'custom' },
                layerId,
                floorId,
                discipline: 'architecture',
              });
            } else {
              createSvgShapeFromPoints(points);
            }
          });
        } else {
          createSvgShape();
        }

        function createSvgShape() {
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          finalSegments.forEach((s) =>
            s.points.forEach((p) => {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }),
          );

          if (minX === Infinity) {
            minX = 0;
            minY = 0;
            maxX = 100;
            maxY = 100;
          }

          const w = maxX - minX;
          const h = maxY - minY;

          if (isFill) {
            let d = '';
            const mapX = (x: number) => x - minX;
            const mapY = (y: number) => y - minY;

            finalSegments.forEach((s) => {
              if (s.type === 'M') d += `M ${mapX(s.points[0].x)} ${mapY(s.points[0].y)} `;
              else if (s.type === 'L') d += `L ${mapX(s.points[0].x)} ${mapY(s.points[0].y)} `;
              else if (s.type === 'C')
                d += `C ${mapX(s.points[0].x)} ${mapY(s.points[0].y)}, ${mapX(s.points[1].x)} ${mapY(s.points[1].y)}, ${mapX(s.points[2].x)} ${mapY(s.points[2].y)} `;
              else if (s.type === 'Z') d += `Z `;
            });

            const sw = isStroke ? Math.max(currentState.lineWidth, 1) : 0;
            const strokeAttr = isStroke
              ? `stroke="${currentState.strokeColor}" stroke-width="${sw}"`
              : 'stroke="none"';

            const svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="${currentState.fillColor}" ${strokeAttr} /></svg>`;

            shapes.push({
              id: generateId('pdf-fill'),
              type: 'rect',
              x: minX,
              y: minY,
              width: w,
              height: h,
              svgRaw: svg,
              svgViewBox: { x: 0, y: 0, width: w, height: h },
              strokeColor: currentState.strokeColor,
              fillColor: currentState.fillColor,
              strokeEnabled: isStroke,
              fillEnabled: isFill && currentState.fillColor !== 'transparent',
              colorMode: { fill: 'custom', stroke: 'custom' },
              layerId,
              floorId,
              discipline: 'architecture',
              points: [],
            });
          } else {
            const subpaths: Point[][] = [];
            let currentSubpath: Point[] = [];

            finalSegments.forEach((s) => {
              if (s.type === 'M') {
                if (currentSubpath.length > 0) {
                  subpaths.push(currentSubpath);
                  currentSubpath = [];
                }
                if (s.points.length > 0) {
                  currentSubpath.push(s.points[0]);
                }
              } else if (s.type === 'L' && s.points.length > 0) {
                currentSubpath.push(s.points[0]);
              } else if (s.type === 'C') {
                const p0 =
                  currentSubpath.length > 0
                    ? currentSubpath[currentSubpath.length - 1]
                    : { x: 0, y: 0 };
                const p1 = s.points[0];
                const p2 = s.points[1];
                const p3 = s.points[2];

                const steps = 10;
                for (let t = 1; t <= steps; t++) {
                  const T = t / steps;
                  const u = 1 - T;
                  const x =
                    u * u * u * p0.x +
                    3 * u * u * T * p1.x +
                    3 * u * T * T * p2.x +
                    T * T * T * p3.x;
                  const y =
                    u * u * u * p0.y +
                    3 * u * u * T * p1.y +
                    3 * u * T * T * p2.y +
                    T * T * T * p3.y;
                  currentSubpath.push({ x, y });
                }
              } else if (s.type === 'Z' && currentSubpath.length > 0) {
                const first = currentSubpath[0];
                const last = currentSubpath[currentSubpath.length - 1];
                const dist = Math.sqrt(
                  Math.pow(first.x - last.x, 2) + Math.pow(first.y - last.y, 2),
                );
                if (dist > 0.001) {
                  currentSubpath.push({ ...first });
                }
              }
            });

            if (currentSubpath.length > 0) {
              subpaths.push(currentSubpath);
            }

            subpaths.forEach((flattenedPoints) => {
              if (flattenedPoints.length < 2) return;

              shapes.push({
                id: generateId('pdf-complex'),
                type: 'polyline',
                points: flattenedPoints,
                strokeColor: currentState.strokeColor,
                strokeWidth: Math.max(currentState.lineWidth * viewportMatrix[0], 1),
                strokeEnabled: true,
                fillColor: 'transparent',
                fillEnabled: false,
                colorMode: { fill: 'custom', stroke: 'custom' },
                layerId,
                floorId,
                discipline: 'architecture',
              });
            });
          }
        }

        function createSvgShapeFromPoints(pts: Point[]) {
          if (pts.length < 2) return;

          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          pts.forEach((p) => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          });

          if (minX === Infinity) {
            minX = 0;
            minY = 0;
            maxX = 100;
            maxY = 100;
          }

          const w = maxX - minX || 1;
          const h = maxY - minY || 1;

          const mapX = (x: number) => x - minX;
          const mapY = (y: number) => y - minY;

          let d = `M ${mapX(pts[0].x)} ${mapY(pts[0].y)} `;
          for (let i = 1; i < pts.length; i++) {
            d += `L ${mapX(pts[i].x)} ${mapY(pts[i].y)} `;
          }

          const sw = isStroke ? Math.max(currentState.lineWidth, 1) : 0;
          const strokeAttr = isStroke
            ? `stroke="${currentState.strokeColor}" stroke-width="${sw}"`
            : 'stroke="none"';

          const svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="${currentState.fillColor}" ${strokeAttr} /></svg>`;

          shapes.push({
            id: generateId('pdf-fill'),
            type: 'rect',
            x: minX,
            y: minY,
            width: w,
            height: h,
            svgRaw: svg,
            svgViewBox: { x: 0, y: 0, width: w, height: h },
            strokeColor: currentState.strokeColor,
            fillColor: currentState.fillColor,
            strokeEnabled: isStroke,
            fillEnabled: isFill && currentState.fillColor !== 'transparent',
            colorMode: { fill: 'custom', stroke: 'custom' },
            layerId,
            floorId,
            discipline: 'architecture',
            points: [],
          });
        }

        currentPath = [];
        pathSegments = [];
        break;
    }
  }

  if (shapes.length > 0) {
    let minX = Infinity,
      minY = Infinity,
      maxY = -Infinity;

    shapes.forEach((s) => {
      if (s.type === 'line' || s.type === 'polyline') {
        s.points?.forEach((p) => {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        });
      } else if (s.x !== undefined && s.y !== undefined) {
        if (s.x < minX) minX = s.x;
        if (s.y < minY) minY = s.y;
        let shapeHeight = 0;
        if (s.type === 'text') shapeHeight = s.fontSize || 12;
        else if ('height' in s && typeof (s as any).height === 'number')
          shapeHeight = (s as any).height;
        const shapeBottom = s.y + shapeHeight;
        if (s.y > maxY) maxY = s.y;
        if (shapeBottom > maxY) maxY = shapeBottom;
      }
    });

    if (minX !== Infinity && minY !== Infinity) {
      const contentHeight = maxY - minY;

      shapes.forEach((s) => {
        if (s.type === 'line' || s.type === 'polyline') {
          s.points = s.points?.map((p) => ({ x: p.x - minX, y: contentHeight - (p.y - minY) }));
        } else if (s.type === 'rect' && s.height !== undefined) {
          if (s.x !== undefined) s.x -= minX;
          if (s.y !== undefined) s.y = contentHeight - (s.y - minY) - s.height;
        } else if (s.type === 'text') {
          if (s.x !== undefined) s.x -= minX;
          if (s.y !== undefined) s.y = contentHeight - (s.y - minY);
        } else {
          if (s.x !== undefined) s.x -= minX;
          if (s.y !== undefined) s.y = contentHeight - (s.y - minY);
        }
      });
    }
  }

  return shapes;
};
