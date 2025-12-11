import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useUIStore } from '../../../../stores/useUIStore';
import { useDataStore } from '../../../../stores/useDataStore';
import { useEditorLogic } from '../../hooks/useEditorLogic';
import StaticCanvas from './StaticCanvas';
import DynamicOverlay from './DynamicOverlay';
import UserHint from '../UserHint';

const CanvasManager: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const uiStore = useUIStore();
    const dataStore = useDataStore();
    const { zoomToFit } = useEditorLogic();
    const hasInitialized = useRef(false);

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

    // Center view on initial load
    useEffect(() => {
        if (!hasInitialized.current && dims.width > 0 && dims.height > 0) {
            hasInitialized.current = true;
            // Small delay to ensure canvas size is set
            setTimeout(() => {
                zoomToFit();
            }, 50);
        }
    }, [dims.width, dims.height, zoomToFit]);

    // Hint Logic
    useEffect(() => { setHintDismissed(false); }, [uiStore.activeTool]);

    let hintMessage = "";
    if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && uiStore.selectedShapeIds.size > 0) hintMessage = "Arraste para mover/rotacionar";
    else if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && uiStore.selectedShapeIds.size === 0) hintMessage = "Selecione objetos primeiro";
    else if (uiStore.activeTool === 'electrical-symbol') hintMessage = "Clique para inserir. R para girar, F/V para espelhar, continue clicando para duplicar.";

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
