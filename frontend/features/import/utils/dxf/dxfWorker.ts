import DxfParser from 'dxf-parser';
import { DxfWorkerInput, DxfWorkerOutput } from './types';

const parser = new DxfParser();

self.onmessage = (e: MessageEvent<DxfWorkerInput>) => {
  try {
    const { text } = e.data;

    // Config parser if needed
    // parser.setAutoComplete(true); // if available

    const data = parser.parseSync(text);

    const response: DxfWorkerOutput = {
      success: true,
      data: data as any
    };
    self.postMessage(response);
  } catch (err) {
    self.postMessage({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    } as DxfWorkerOutput);
  }
};
