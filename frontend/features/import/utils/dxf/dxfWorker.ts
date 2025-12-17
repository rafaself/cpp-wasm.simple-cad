import DxfParser from 'dxf-parser/dist/dxf-parser.js';
import { convertDxfToShapes } from './dxfToShapes';
import { dxfToSvg } from './dxfToSvg';
import { cleanupShapes } from './cleanup';
import { augmentParsedDxfDataWithRaw } from './dxfRawExtras';
import { DxfWorkerInput, DxfWorkerOutput, DxfImportOptions, DxfData } from './types';
import { Shape } from '../../../../types';

// Extend Input Options to include mode
export interface ExtendedDxfWorkerInput extends DxfWorkerInput {
    mode?: 'shapes' | 'svg';
}

const parser = new DxfParser();

const generateUuid = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const sanitizeLayerId = (name: string): string => {
    return name.replace(/[^a-zA-Z0-9-_]/g, '_');
};

self.onmessage = (e: MessageEvent<ExtendedDxfWorkerInput>) => {
  try {
    const { text, options, mode } = e.data;

    // Cast to unknown first to avoid IDxf incompatibility with our defined DxfData
    const data = augmentParsedDxfDataWithRaw(text, parser.parseSync(text) as unknown as DxfData);

    if (mode === 'svg') {
        // SVG Mode
        const { svgRaw, viewBox, unitsScale } = dxfToSvg(data, options);

        // Create a single Shape of type 'rect' (as container)
        // Center it based on viewBox
        const shapeId = generateUuid();
        const width = viewBox.width * unitsScale;
        const height = viewBox.height * unitsScale;
        const x = viewBox.x;
        const y = viewBox.y;

        const svgShape: Shape = {
            id: shapeId,
            type: 'rect',
            layerId: options.defaultLayerId, // Place container on import layer
            x: 0,
            y: 0,
            width: width,
            height: height,
            strokeColor: '#000000', // Placeholder
            fillColor: 'transparent',
            points: [], // Required by type
            svgRaw: svgRaw,
            svgViewBox: viewBox,
            discipline: 'architecture',
            scaleY: -1,
            // svgHiddenLayers can be populated initially empty or handled by UI
            svgHiddenLayers: []
        };

        // Layers metadata
        // We need to return the layers found in the DXF so the UI can create them.
        const layersList = [];
        if (data.tables && data.tables.layer && data.tables.layer.layers) {
            for (const name in data.tables.layer.layers) {
                const l = data.tables.layer.layers[name];
                layersList.push({
                    id: sanitizeLayerId(name), // Match sanitized ID used in SVG
                    name: name,
                    strokeColor: '#ffffff', // Default
                    strokeEnabled: true,
                    fillColor: 'transparent',
                    fillEnabled: false,
                    visible: l.visible !== false,
                    locked: l.frozen === true,
                    isNative: false
                });
            }
        } else {
             // Fallback: iterate entities to find layers
             const distinctLayers = new Set<string>();
             data.entities.forEach(e => { if(e.layer) distinctLayers.add(e.layer); });
             distinctLayers.forEach(name => {
                 layersList.push({
                    id: sanitizeLayerId(name),
                    name: name,
                    strokeColor: '#ffffff',
                    strokeEnabled: true,
                    fillColor: 'transparent',
                    fillEnabled: false,
                    visible: true,
                    locked: false,
                    isNative: false
                });
             });
        }

        const response: DxfWorkerOutput = {
            success: true,
            data: {
                shapes: [svgShape],
                layers: layersList,
                width: width,
                height: height,
                origin: { x, y }
            }
        };
        self.postMessage(response);

    } else {
        // Shapes Mode (Legacy/Default)
        const result = convertDxfToShapes(data, options);
        const cleanShapes = cleanupShapes(result.shapes);
        const response: DxfWorkerOutput = {
            success: true,
            data: {
                shapes: cleanShapes,
                layers: result.layers,
                width: result.width,
                height: result.height,
                origin: result.origin
            }
        };
        self.postMessage(response);
    }

  } catch (err) {
    self.postMessage({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    } as DxfWorkerOutput);
  }
};
