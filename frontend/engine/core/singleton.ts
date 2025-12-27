import { EngineRuntime } from './EngineRuntime';

let runtimePromise: Promise<EngineRuntime> | null = null;
let runtimeInstance: EngineRuntime | null = null;

export const getEngineRuntime = (): Promise<EngineRuntime> => {
  runtimePromise ??= EngineRuntime.create().then((runtime) => {
    runtimeInstance = runtime;
    return runtime;
  });
  return runtimePromise;
};

export const getEngineRuntimeSync = (): EngineRuntime | null => runtimeInstance;
