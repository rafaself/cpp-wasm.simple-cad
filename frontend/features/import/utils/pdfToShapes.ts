import { Shape, Point, NormalizedViewBox } from '../../../types';
import * as pdfjs from 'pdfjs-dist/build/pdf';
import { generateId } from '../../../utils/uuid';

// Basic Matrix [a, b, c, d, e, f]
// x' = ax + cy + e
// y' = bx + dy + f
type Matrix = [number, number, number, number, number, number];

const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];
const isDevEnv = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

const multiplyMatrix = (m1: Matrix, m2: Matrix): Matrix => {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
};

const CTM_TRANSLATION_WARN = 1_000_000;
const CTM_SCALE_WARN = 10_000;

const applyMatrix = (p: Point, m: Matrix): Point => {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  };
};

const formatColor = (args: number[]): string => {
  if (args.length === 1) {
    // Grayscale
    const v = Math.round(args[0] * 255);
    return `rgb(${v}, ${v}, ${v})`;
  } else if (args.length === 3) {
    // RGB
    const r = Math.round(args[0] * 255);
    const g = Math.round(args[1] * 255);
    const b = Math.round(args[2] * 255);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (args.length === 4) {
    // CMYK
    const c = args[0];
    const m = args[1];
    const y = args[2];
    const k = args[3];
    const r = Math.round(255 * (1 - c) * (1 - k));
    const g = Math.round(255 * (1 - m) * (1 - k));
    const b = Math.round(255 * (1 - y) * (1 - k));
    return `rgb(${r}, ${g}, ${b})`;
  }
  return '#000000';
};

interface GraphicsState {
  ctm: Matrix;
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
  // We can add dash array etc. later
}

export const convertPdfPageToShapes = async (
  page: any, // PDFPageProxy type is tricky to import directly sometimes
  floorId: string,
  layerId: string
): Promise<Shape[]> => {
  const opList = await page.getOperatorList();
  const viewport = page.getViewport({ scale: 1.0 }); // 1pt = 1px, usually
  
  // Transform from PDF User Space to Canvas Space
  // viewport.transform is [a, b, c, d, e, f]
  const viewportMatrix: Matrix = viewport.transform;

  const shapes: Shape[] = [];
  
  const stateStack: GraphicsState[] = [];
  let currentState: GraphicsState = {
    ctm: IDENTITY_MATRIX,
    strokeColor: '#000000',
    fillColor: '#000000',
    lineWidth: 1,
  };

  let currentPath: string[] = [];
  let currentStartPoint: Point = { x: 0, y: 0 }; // For closePath
  let currentPoint: Point = { x: 0, y: 0 };
  
  // To detect simple shapes
  let pathSegments: { type: 'M' | 'L' | 'C' | 'Z'; points: Point[] }[] = [];

  const { fnArray, argsArray } = opList;

  // Process Text Content
  try {
    const textContent = await page.getTextContent();
    const textItems: any[] = [];

    // Calculate viewport scale factor for transforming sizes
    const viewportScale = Math.sqrt(viewportMatrix[0] * viewportMatrix[0] + viewportMatrix[1] * viewportMatrix[1]);

    // 1. Map and collect items
    for (const item of textContent.items) {
      if ('str' in item) {
        // Skip empty text or just whitespace if desired, but sometimes whitespace is important for spacing.
        // If it's just a space, it might be the gap between words.
        if (item.str.trim().length === 0 && item.width === 0) continue;

        const tx = item.transform[4];
        const ty = item.transform[5];
        
        // Calculate raw position in Canvas Space
        const p = applyMatrix({ x: tx, y: ty }, viewportMatrix);
        
        // Calculate text width in Canvas Space
        // item.width is typically in User Space (already scaled by font size in PDF).
        const width = item.width * viewportScale;
        
        // Font size calculation:
        // The transform matrix is [a, b, c, d, tx, ty] where:
        // - Vertical extent (height) = sqrt(c² + d²) = sqrt(transform[2]² + transform[3]²)
        // - Horizontal extent (width) = sqrt(a² + b²) = sqrt(transform[0]² + transform[1]²)
        // For text, the vertical extent represents the font size in PDF user space.
        // PDF.js 4.x also provides item.height directly which is more reliable.
        let fontSize: number;
        if ('height' in item && typeof item.height === 'number' && item.height > 0) {
          // Use height provided by PDF.js (already in user space units)
          fontSize = item.height * viewportScale;
        } else {
          // Calculate from transform matrix using the vertical extent formula
          const c = item.transform[2];
          const d = item.transform[3];
          const verticalExtent = Math.sqrt(c * c + d * d);
          fontSize = verticalExtent * viewportScale;
        }
        
        // Ensure minimum font size to avoid invisible text
        fontSize = Math.max(fontSize, 1);

        textItems.push({
          str: item.str,
          x: p.x,
          y: p.y,
          width: width,
          fontSize: fontSize,
          // Store original transform components if needed for precise merging
          origY: ty 
        });
      }
    }

    // 2. Sort items
    // Sort by Y (descending or ascending? PDF Y is usually up, but we mapped to Canvas Y).
    // Let's rely on our mapped 'y'.
    // We want to group by "Line".
    textItems.sort((a, b) => {
        // Use a tolerance proportional to average font size for Y comparison
        const avgFontSize = (a.fontSize + b.fontSize) / 2;
        const yTolerance = avgFontSize * 1.0; // 100% of font size as tolerance (full line height)
        if (Math.abs(a.y - b.y) > yTolerance) { 
            return a.y - b.y; 
        }
        return a.x - b.x;
    });

    // 3. Merge items
    const mergedItems: any[] = [];
    if (textItems.length > 0) {
        let current = textItems[0];
        
        for (let k = 1; k < textItems.length; k++) {
            const next = textItems[k];
            
            // Check if on same line (Y close) - use proportional tolerance
            const avgFontSize = (current.fontSize + next.fontSize) / 2;
            const yTolerance = avgFontSize * 1.0; // 100% of font size as tolerance
            const sameLine = Math.abs(current.y - next.y) < yTolerance;
            
            // Check if adjacent (Next X approx Current X + Current Width)
            // PDF text fragments can have large gaps between them on the same line
            // Use a generous tolerance (5em) to merge text on the same line
            const expectedNextX = current.x + current.width;
            const gap = next.x - expectedNextX;
            const maxGap = current.fontSize * 5; // Allow gap up to 5em
            const isAdjacent = gap > -current.fontSize && gap < maxGap;
            
            // Check properties - relaxed size comparison (30% tolerance)
            const sameSize = Math.abs(current.fontSize - next.fontSize) < Math.max(current.fontSize, next.fontSize) * 0.3;

            if (sameLine && isAdjacent && sameSize) {
                // Merge
                // If there is a significant gap, insert a space
                // PDF text fragments often omit the space and rely on positioning.
                let separator = '';
                if (gap > current.fontSize * 0.1) {
                    separator = ' ';
                }

                current.str += separator + next.str;
                current.width += gap + next.width;
                // Keep current x, y, fontSize
            } else {
                // Push current and start new
                mergedItems.push(current);
                current = next;
            }
        }
        mergedItems.push(current);
    }

    // 4. Generate Shapes
    mergedItems.forEach(item => {
        shapes.push({
          id: generateId('pdf-text'),
          type: 'text',
          x: item.x,
          y: item.y,
          textContent: item.str,
          fontSize: item.fontSize || 12,
          fontFamily: 'sans-serif',
          strokeColor: '#000000',
          strokeWidth: 1,
          strokeEnabled: true,
          fillColor: 'transparent',
          fillEnabled: false,
          layerId,
          floorId,
          discipline: 'architecture',
        });
    });

  } catch (e) {
    console.warn("Error extracting text content", e);
  }

  // We need to map operator IDs to names if we don't have the OPS enum
  // But typically we can just assume standard PDF operator IDs or use the exported OPS
  // If we can't get OPS, we might need a fallback. 
  // For now, let's assume we traverse and handle the most common ones by ID if we could, 
  // but readable names are better. 
  // pdfjs.OPS is usually available.
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

      case OPS.transform: // cm
        const [a, b, c, d, e, f] = args;
        // Apply new transform to the Current Transformation Matrix (pre-multiply as per PDF spec)
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
            console.warn('[pdfToShapes] Suspicious CTM after transform', {
              applied: incomingMatrix,
              resulting: nextCtm,
            });
          }
        }

        currentState.ctm = nextCtm;
        break;

      case OPS.setLineWidth: // w
        const wVal = args[0];
        // Fix B: No zero stroke width
        currentState.lineWidth = wVal <= 0 ? 0.05 : wVal;
        break;

      case OPS.setStrokeColor: // SC, SCN
      case OPS.setStrokeRGBColor: // RG
      case OPS.setStrokeGray: // G
      case OPS.setStrokeCMYKColor: // K
        // Force Black as per user request
        currentState.strokeColor = '#000000';
        break;

      case OPS.setFillColor: // sc, scn
      case OPS.setFillRGBColor: // rg
      case OPS.setFillGray: // g
      case OPS.setFillCMYKColor: // k
        // Force Black as per user request
        currentState.fillColor = '#000000';
        break;

      // Path Construction
      case OPS.constructPath: // Special pdf.js operator that bundles path ops
        // args[0] is ops, args[1] is data
        const pathOps = args[0];
        const pathData = args[1];
        let dIndex = 0;
        for (let j = 0; j < pathOps.length; j++) {
          const op = pathOps[j];
          
          // Fix A: Phantom Lines
          // If starting a subpath without explicit MoveTo, synthesize one from currentPoint
          if (pathSegments.length === 0 && op !== OPS.moveTo && op !== OPS.rectangle) {
               // Synthesize MoveTo currentPoint
               // We need valid currentPoint. It defaults to 0,0.
               // We accept that if no MoveTo was ever called, 0,0 is the start.
               const p0 = currentPoint; 
               currentPath.push(`M ${p0.x} ${p0.y}`);
               currentStartPoint = p0;
               pathSegments.push({ type: 'M', points: [p0] });
          }

          switch (op) {
             case OPS.moveTo:
               const p0 = applyMatrix({ x: pathData[dIndex], y: pathData[dIndex+1] }, currentState.ctm);
               currentPath.push(`M ${p0.x} ${p0.y}`);
               currentPoint = p0;
               currentStartPoint = p0;
               pathSegments.push({ type: 'M', points: [p0] });
               dIndex += 2;
               break;
             case OPS.lineTo:
               const p1 = applyMatrix({ x: pathData[dIndex], y: pathData[dIndex+1] }, currentState.ctm);
               currentPath.push(`L ${p1.x} ${p1.y}`);
               currentPoint = p1;
               pathSegments.push({ type: 'L', points: [p1] });
               dIndex += 2;
               break;
             case OPS.curveTo:
               const c1 = applyMatrix({ x: pathData[dIndex], y: pathData[dIndex+1] }, currentState.ctm);
               const c2 = applyMatrix({ x: pathData[dIndex+2], y: pathData[dIndex+3] }, currentState.ctm);
               const p2 = applyMatrix({ x: pathData[dIndex+4], y: pathData[dIndex+5] }, currentState.ctm);
               currentPath.push(`C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`);
               currentPoint = p2;
               pathSegments.push({ type: 'C', points: [c1, c2, p2] });
               dIndex += 6;
               break;
             // Add curveTo2 (v), curveTo3 (y) if needed, usually mapped to curveTo in constructPath?
             case OPS.rectangle:
                const rx = pathData[dIndex];
                const ry = pathData[dIndex+1];
                const rw = pathData[dIndex+2];
                const rh = pathData[dIndex+3];
                // Transform all 4 corners to handle rotation
                const r1 = applyMatrix({ x: rx, y: ry }, currentState.ctm);
                const r2 = applyMatrix({ x: rx + rw, y: ry }, currentState.ctm);
                const r3 = applyMatrix({ x: rx + rw, y: ry + rh }, currentState.ctm);
                const r4 = applyMatrix({ x: rx, y: ry + rh }, currentState.ctm);
                
                currentPath.push(`M ${r1.x} ${r1.y} L ${r2.x} ${r2.y} L ${r3.x} ${r3.y} L ${r4.x} ${r4.y} Z`);
                // For rectangle detection, we can push a special segment
                // But simplified: just treat as closed path
                pathSegments = [
                    { type: 'M', points: [r1] },
                    { type: 'L', points: [r2] },
                    { type: 'L', points: [r3] },
                    { type: 'L', points: [r4] },
                    { type: 'Z', points: [] }
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

      // Painting
      case OPS.stroke:
      case OPS.fill: 
      case OPS.eoFill:
      case OPS.fillStroke: 
      case OPS.eoFillStroke:
      case OPS.closeStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        if (pathSegments.length === 0) break;

        // Apply Viewport Transform to all points in pathSegments
        // Wait, we already applied CTM. Now we need to apply Viewport Transform?
        // Yes, CTM maps User -> Form/Page Space. Viewport maps Page Space -> Canvas Space.
        
        const finalSegments = pathSegments.map(seg => ({
            ...seg,
            points: seg.points.map(p => applyMatrix(p, viewportMatrix))
        }));

        // Determine Shape Type
        const isClosed = finalSegments[finalSegments.length - 1].type === 'Z' || 
                         [OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(fn);
        
        const isStroke = [OPS.stroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(fn);
        const isFill = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(fn);

        // Simple Line Detection: Only if NOT filled (lines usually aren't filled)
        if (finalSegments.length === 2 && finalSegments[0].type === 'M' && finalSegments[1].type === 'L' && !isFill) {
            shapes.push({
                id: generateId('pdf-line'),
                type: 'line',
                points: [finalSegments[0].points[0], finalSegments[1].points[0]],
                strokeColor: currentState.strokeColor,
                strokeWidth: Math.max(currentState.lineWidth * viewportMatrix[0], 1), // Force min 1px
                strokeEnabled: true,
                fillColor: 'transparent',
                fillEnabled: false,
                layerId,
                floorId,
                discipline: 'architecture',
            });
        } 
        // Polyline / Rect Detection
        else if (finalSegments.every(s => s.type === 'M' || s.type === 'L' || s.type === 'Z')) {
            // Split into subpaths based on MoveTo commands
            // Each MoveTo starts a new subpath (except the first one)
            const subpaths: Point[][] = [];
            let currentSubpath: Point[] = [];
            
            finalSegments.forEach(s => {
                if (s.type === 'M') {
                    // If we have an existing subpath with points, save it and start a new one
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
                    // Close the subpath by connecting back to first point
                    const first = currentSubpath[0];
                    const last = currentSubpath[currentSubpath.length - 1];
                    const dist = Math.sqrt(Math.pow(first.x - last.x, 2) + Math.pow(first.y - last.y, 2));
                    if (dist > 0.001) {
                        currentSubpath.push({ ...first });
                    }
                }
            });
            
            // Don't forget the last subpath
            if (currentSubpath.length > 0) {
                subpaths.push(currentSubpath);
            }

            // Create shapes for each subpath
            subpaths.forEach(points => {
                // Skip degenerate subpaths (less than 2 points means no visible line)
                if (points.length < 2) return;

                if (isFill) {
                     // Filled shape -> Use SVG/Rect
                     // For fills, we need to create SVG with all subpaths
                     // But for simplicity, create individual shapes per subpath
                     createSvgShapeFromPoints(points);
                } else if (isStroke) {
                    // Just stroke -> Polyline
                    shapes.push({
                        id: generateId('pdf-poly'),
                        type: 'polyline',
                        points: points,
                        strokeColor: currentState.strokeColor,
                        strokeWidth: Math.max(currentState.lineWidth * viewportMatrix[0], 1), // Force min 1px
                        strokeEnabled: true,
                        fillColor: 'transparent',
                        fillEnabled: false,
                        layerId,
                        floorId,
                        discipline: 'architecture',
                    });
                } else {
                     // Fill and Stroke -> SVG
                     createSvgShapeFromPoints(points);
                }
            });
        } else {
            // Curves -> SVG
            createSvgShape();
        }

        function createSvgShape() {
            // Reconstruct path data string in Canvas Space
            // Calculate bounding box for SVG viewbox
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
             finalSegments.forEach(s => s.points.forEach(p => {
                 minX = Math.min(minX, p.x);
                 minY = Math.min(minY, p.y);
                 maxX = Math.max(maxX, p.x);
                 maxY = Math.max(maxY, p.y);
             }));
             
             if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
             
             const w = maxX - minX;
             const h = maxY - minY;

             if (isFill) {
                 // Use Rect with svgRaw for fills
                 // Generate SVG path data relative to bbox (no Y-flip here - global flip handles orientation)
                 let d = '';
                 // Map: just subtract minX, minY to normalize to local coordinates
                 const mapX = (x: number) => x - minX;
                 const mapY = (y: number) => y - minY; // No flip - global normalization handles this

                 finalSegments.forEach(s => {
                    if (s.type === 'M') d += `M ${mapX(s.points[0].x)} ${mapY(s.points[0].y)} `;
                    else if (s.type === 'L') d += `L ${mapX(s.points[0].x)} ${mapY(s.points[0].y)} `;
                    else if (s.type === 'C') d += `C ${mapX(s.points[0].x)} ${mapY(s.points[0].y)}, ${mapX(s.points[1].x)} ${mapY(s.points[1].y)}, ${mapX(s.points[2].x)} ${mapY(s.points[2].y)} `;
                    else if (s.type === 'Z') d += `Z `;
                });
                
                // Construct SVG
                // We use currentState colors
                // Force min 1px if stroke is active
                const sw = isStroke ? Math.max(currentState.lineWidth, 1) : 0;
                const strokeAttr = isStroke ? `stroke="${currentState.strokeColor}" stroke-width="${sw}"` : 'stroke="none"';
                
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
                    strokeColor: 'transparent', // Handled by SVG
                    fillColor: 'transparent',
                    layerId,
                    floorId,
                    discipline: 'architecture',
                });
             } else {
                // Fallback for curves without fill -> Polyline approximation
                // Split into subpaths to avoid phantom lines
                const subpaths: Point[][] = [];
                let currentSubpath: Point[] = [];
                
                finalSegments.forEach(s => {
                    if (s.type === 'M') {
                        // MoveTo starts a new subpath
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
                        // Approximate Bezier curve
                        const p0 = currentSubpath.length > 0 ? currentSubpath[currentSubpath.length - 1] : {x:0, y:0};
                        const p1 = s.points[0];
                        const p2 = s.points[1];
                        const p3 = s.points[2];
                        
                        const steps = 10;
                        for (let t = 1; t <= steps; t++) {
                            const T = t / steps;
                            const u = 1 - T;
                            const x = u*u*u*p0.x + 3*u*u*T*p1.x + 3*u*T*T*p2.x + T*T*T*p3.x;
                            const y = u*u*u*p0.y + 3*u*u*T*p1.y + 3*u*T*T*p2.y + T*T*T*p3.y;
                            currentSubpath.push({x, y});
                        }
                    } else if (s.type === 'Z' && currentSubpath.length > 0) {
                        // Close the subpath
                        const first = currentSubpath[0];
                        const last = currentSubpath[currentSubpath.length - 1];
                        const dist = Math.sqrt(Math.pow(first.x - last.x, 2) + Math.pow(first.y - last.y, 2));
                        if (dist > 0.001) {
                            currentSubpath.push({ ...first });
                        }
                    }
                });
                
                // Don't forget the last subpath
                if (currentSubpath.length > 0) {
                    subpaths.push(currentSubpath);
                }
                
                // Create a polyline for each subpath
                subpaths.forEach(flattenedPoints => {
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
                        layerId,
                        floorId,
                        discipline: 'architecture',
                    });
                });
             }
        }

        // Create SVG shape from a specific set of points (for subpaths)
        function createSvgShapeFromPoints(pts: Point[]) {
            if (pts.length < 2) return;
            
            // Calculate bounding box
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            pts.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
            
            if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
            
            const w = maxX - minX || 1;
            const h = maxY - minY || 1;
            
            // Build SVG path
            const mapX = (x: number) => x - minX;
            const mapY = (y: number) => y - minY;
            
            let d = `M ${mapX(pts[0].x)} ${mapY(pts[0].y)} `;
            for (let i = 1; i < pts.length; i++) {
                d += `L ${mapX(pts[i].x)} ${mapY(pts[i].y)} `;
            }
            
            const sw = isStroke ? Math.max(currentState.lineWidth, 1) : 0;
            const strokeAttr = isStroke ? `stroke="${currentState.strokeColor}" stroke-width="${sw}"` : 'stroke="none"';
            
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
                strokeColor: 'transparent',
                fillColor: 'transparent',
                layerId,
                floorId,
                discipline: 'architecture',
            });
        }

        // Reset path
        currentPath = [];
        pathSegments = [];
        break;
    }
  }

  // Normalize coordinates and fix vertical flip
  // PDF coordinate system has Y pointing UP, canvas has Y pointing DOWN.
  // The viewportMatrix from pdf.js handles this, but results in a vertically mirrored image.
  // We need to flip the content vertically to match the original document appearance.
  if (shapes.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      // First pass: find bounding box
      shapes.forEach(s => {
          if (s.type === 'line' || s.type === 'polyline' || s.type === 'eletroduto' || s.type === 'conduit') {
              s.points?.forEach(p => {
                  if (p.x < minX) minX = p.x;
                  if (p.y < minY) minY = p.y;
                  if (p.y > maxY) maxY = p.y;
              });
          } else if (s.x !== undefined && s.y !== undefined) {
               if (s.x < minX) minX = s.x;
               if (s.y < minY) minY = s.y;
               // For shapes with height, consider the full extent
               // Text shapes use fontSize as their height
               let shapeHeight = 0;
               if (s.type === 'text') {
                   shapeHeight = s.fontSize || 12;
               } else if ('height' in s && typeof (s as any).height === 'number') {
                   shapeHeight = (s as any).height;
               }
               const shapeBottom = s.y + shapeHeight;
               if (s.y > maxY) maxY = s.y;
               if (shapeBottom > maxY) maxY = shapeBottom;
          }
      });

      if (minX !== Infinity && minY !== Infinity) {
          const contentHeight = maxY - minY;
          
          // Second pass: normalize to (0,0) AND flip Y to correct orientation
          shapes.forEach(s => {
              if (s.type === 'line' || s.type === 'polyline' || s.type === 'eletroduto' || s.type === 'conduit') {
                  s.points = s.points?.map(p => ({ 
                      x: p.x - minX, 
                      y: contentHeight - (p.y - minY) // Flip Y
                  }));
              } else if (s.type === 'rect' && s.height !== undefined) {
                  // For rectangles, we need to flip and account for height
                  // After flipping, the rectangle's anchor point (top-left) changes
                  if (s.x !== undefined) s.x -= minX;
                  if (s.y !== undefined) {
                      // Flip Y and adjust for height so the rect appears in correct position
                      s.y = contentHeight - (s.y - minY) - s.height;
                  }
              } else if (s.type === 'text') {
                  // For text shapes: PDF baseline after Y-flip becomes the correct visual position
                  // No need to subtract textHeight - the flip handles the coordinate transformation
                  if (s.x !== undefined) s.x -= minX;
                  if (s.y !== undefined) {
                      s.y = contentHeight - (s.y - minY);
                  }
              } else {
                  // For other shapes (circles, etc.)
                  if (s.x !== undefined) s.x -= minX;
                  if (s.y !== undefined) s.y = contentHeight - (s.y - minY); // Flip Y
              }
          });
      }
  }

  return shapes;
};
