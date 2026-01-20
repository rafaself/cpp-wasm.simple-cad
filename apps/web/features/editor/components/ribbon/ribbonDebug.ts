export const RIBBON_DEBUG_ATTR = 'data-ribbon-debug';

const getWindowFlag = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return Boolean((window as typeof globalThis & { __RIBBON_DEBUG__?: boolean }).__RIBBON_DEBUG__);
};

export const isRibbonDebugEnabled = (): boolean => {
  return import.meta.env.VITE_RIBBON_DEBUG === 'true' || getWindowFlag();
};
