import { useEffect, useState } from 'react';

import type { EngineRuntime } from './EngineRuntime';
import { getEngineRuntime, getEngineRuntimeSync } from './singleton';

export const useEngineRuntime = (): EngineRuntime | null => {
  const [runtime, setRuntime] = useState<EngineRuntime | null>(() => getEngineRuntimeSync());

  useEffect(() => {
    if (runtime) return;
    let active = true;
    void getEngineRuntime().then((resolved) => {
      if (active) setRuntime(resolved);
    });
    return () => {
      active = false;
    };
  }, [runtime]);

  return runtime;
};
