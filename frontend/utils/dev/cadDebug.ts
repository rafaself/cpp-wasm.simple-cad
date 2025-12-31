/* eslint-disable no-console */

export type CadDebugFlag =
  | 'pointer'
  | 'tool'
  | 'commands'
  | 'events'
  | 'selection'
  | 'overlay'
  | 'render'
  | 'transform'
  | 'draft';

export type CadDebugConfig = {
  enabled?: boolean;
  all?: boolean;
  pointer?: boolean;
  tool?: boolean;
  commands?: boolean;
  events?: boolean;
  selection?: boolean;
  overlay?: boolean;
  render?: boolean;
  transform?: boolean;
  draft?: boolean;
};

const readCadDebugConfig = (): CadDebugConfig | null => {
  if (typeof window === 'undefined') return null;
  return (window as any).__cadDebug ?? null;
};

export const isCadDebugEnabled = (flag: CadDebugFlag): boolean => {
  const config = readCadDebugConfig();
  if (!config || !config.enabled) return false;
  if (config.all) return true;
  return config[flag] === true;
};

export const cadDebugLog = (
  flag: CadDebugFlag,
  message: string,
  meta?: unknown | (() => unknown),
): void => {
  if (!isCadDebugEnabled(flag)) return;
  const payload = typeof meta === 'function' ? (meta as () => unknown)() : meta;
  const prefix = `[cad:${flag}]`;
  if (typeof payload === 'undefined') {
    console.log(prefix, message);
    return;
  }
  console.log(prefix, message, payload);
};
