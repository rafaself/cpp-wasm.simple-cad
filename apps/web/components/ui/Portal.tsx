import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PortalProps {
  children: React.ReactNode;
  container?: HTMLElement | null;
}

export const Portal: React.FC<PortalProps> = ({ children, container }) => {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMountNode(container || document.body);
  }, [container]);

  if (!mountNode) return null;

  return createPortal(children, mountNode);
};
