import { EngineRuntime } from './EngineRuntime';

let runtimePromise: Promise<EngineRuntime> | null = null;

export const getEngineRuntime = (): Promise<EngineRuntime> => {
  runtimePromise ??= EngineRuntime.create();
  return runtimePromise;
};

