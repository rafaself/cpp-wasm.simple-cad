import React from 'react';

import { getRibbonLayoutTier, RibbonLayoutTier } from '../../ui/ribbonLayoutV2';

type RibbonLayoutContextValue = {
  tier: RibbonLayoutTier;
  width: number;
};

const RibbonLayoutContext = React.createContext<RibbonLayoutContextValue>({
  tier: 'full',
  width: 0,
});

export const RibbonLayoutProvider: React.FC<
  React.PropsWithChildren<{ tier: RibbonLayoutTier; width: number }>
> = ({ tier, width, children }) => (
  <RibbonLayoutContext.Provider value={{ tier, width }}>{children}</RibbonLayoutContext.Provider>
);

export const useRibbonLayout = (): RibbonLayoutContextValue =>
  React.useContext(RibbonLayoutContext);

export const useRibbonLayoutTier = (
  ref: React.RefObject<HTMLElement | null>,
): RibbonLayoutContextValue => {
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) {
      setWidth(0);
      return;
    }

    const updateWidth = () => {
      const next = Math.round(node.clientWidth);
      setWidth((prev) => (prev === next ? prev : next));
    };

    updateWidth();

    if (typeof window === 'undefined') return;

    const { ResizeObserver } = window;
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [ref]);

  return { tier: getRibbonLayoutTier(width), width };
};
