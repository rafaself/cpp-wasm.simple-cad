import React from 'react';

import { MarqueeOverlay, SelectionBoxState } from '@/features/editor/components/MarqueeOverlay';
import { useUIStore } from '@/stores/useUIStore';

export const ConnectedMarquee: React.FC<{ box: SelectionBoxState }> = ({ box }) => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);
  return <MarqueeOverlay selectionBox={box} viewTransform={viewTransform} canvasSize={canvasSize} />;
};
