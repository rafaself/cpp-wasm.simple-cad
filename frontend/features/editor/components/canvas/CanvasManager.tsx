import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useUIStore } from '../../../../stores/useUIStore';
import { useDataStore } from '../../../../stores/useDataStore';
import StaticCanvas from './StaticCanvas';
import DynamicOverlay from './DynamicOverlay';
import UserHint from '../UserHint';

const CanvasManager: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const uiStore = useUIStore();

    const [dims, setDims] = useState({ width: 800, height: 600 });
    const [hintDismissed, setHintDismissed] = useState(false);

    // Resize Observer
    useEffect(() => {
        const handleResize = () => {
          if (containerRef.current) {
              const width = containerRef.current.clientWidth;
              const height = containerRef.current.clientHeight;
              if (width !== dims.width || height !== dims.height) {
                  setDims({ width, height });
                  uiStore.setCanvasSize({ width, height });
              }
          }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [uiStore, dims.width, dims.height]);

    // Hint Logic
    useEffect(() => { setHintDismissed(false); }, [uiStore.activeTool]);

    let hintMessage = "";
    if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && uiStore.selectedShapeIds.size > 0) hintMessage = "Arraste para mover/rotacionar";
    else if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && uiStore.selectedShapeIds.size === 0) hintMessage = "Selecione objetos primeiro";

    return (
        <div ref={containerRef} className="relative w-full h-full bg-gray-50 overflow-hidden">
            <StaticCanvas width={dims.width} height={dims.height} />
            <DynamicOverlay
                width={dims.width}
                height={dims.height}
            />

            <UserHint visible={!!hintMessage && !hintDismissed} message={hintMessage} onClose={() => setHintDismissed(true)} />
        </div>
    );
}

export default CanvasManager;
