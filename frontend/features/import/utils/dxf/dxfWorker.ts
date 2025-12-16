import DxfParser from 'dxf-parser';
import { convertDxfToShapes } from './dxfToShapes';
import { cleanupShapes } from './cleanup';
import { DxfWorkerInput, DxfWorkerOutput } from './types';

const parser = new DxfParser();

self.onmessage = (e: MessageEvent<DxfWorkerInput>) => {
  try {
    const { text, options } = e.data;
    const data = parser.parseSync(text);

    // Convert in worker
    const result = convertDxfToShapes(data, options);

    // Cleanup in worker
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
  } catch (err) {
    self.postMessage({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    } as DxfWorkerOutput);
  }
};
