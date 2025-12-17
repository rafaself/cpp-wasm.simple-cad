import React, { useRef, useEffect, useState, useCallback } from "react";
import { useUIStore } from "../../../../stores/useUIStore";
import { useDataStore } from "../../../../stores/useDataStore";
import { useSettingsStore } from "../../../../stores/useSettingsStore";
import { useEditorLogic } from "../../hooks/useEditorLogic";
import StaticCanvas from "./StaticCanvas";
import DynamicOverlay from "./DynamicOverlay";
import UserHint from "../UserHint";

const CanvasManager: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const setCanvasSize = useUIStore((s) => s.setCanvasSize);
  const activeTool = useUIStore((s) => s.activeTool);
  const selectedShapeIdsSize = useUIStore((s) => s.selectedShapeIds.size);
  const setCanvasSizeRef = useRef(setCanvasSize);
  setCanvasSizeRef.current = setCanvasSize;

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
          setCanvasSizeRef.current({ width, height });
        }
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [dims.width, dims.height]);

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
  useEffect(() => {
    setHintDismissed(false);
  }, [activeTool]);

  let hintMessage = "";
  if (
    (activeTool === "move" || activeTool === "rotate") &&
    selectedShapeIdsSize > 0
  )
    hintMessage = "Arraste para mover/rotacionar";
  else if (
    (activeTool === "move" || activeTool === "rotate") &&
    selectedShapeIdsSize === 0
  )
    hintMessage = "Selecione objetos primeiro";
  else if (activeTool === "electrical-symbol")
    hintMessage =
      "Clique para inserir. R para girar, F/V para espelhar, continue clicando para duplicar.";

  const backgroundColor = useSettingsStore(s => s.display.backgroundColor);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor }}
    >
      <StaticCanvas width={dims.width} height={dims.height} />
      <DynamicOverlay width={dims.width} height={dims.height} />

      <UserHint
        visible={!!hintMessage && !hintDismissed}
        message={hintMessage}
        onClose={() => setHintDismissed(true)}
      />
    </div>
  );
};

export default CanvasManager;
