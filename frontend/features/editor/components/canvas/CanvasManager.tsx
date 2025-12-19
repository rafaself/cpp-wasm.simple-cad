import React, { useEffect, useRef, useState } from "react";
import { useUIStore } from "../../../../stores/useUIStore";
import { useSettingsStore } from "../../../../stores/useSettingsStore";
import { useEditorLogic } from "../../hooks/useEditorLogic";
import StaticCanvas from "./StaticCanvas";
import DynamicOverlay from "./DynamicOverlay";
import UserHint from "../UserHint";

interface CanvasManagerProps {
  width: number;
  height: number;
}

const CanvasManager: React.FC<CanvasManagerProps> = ({ width, height }) => {
  const activeTool = useUIStore((s) => s.activeTool);
  const selectedShapeIdsSize = useUIStore((s) => s.selectedShapeIds.size);

  const { zoomToFit } = useEditorLogic();
  const hasInitialized = useRef(false);

  const [hintDismissed, setHintDismissed] = useState(false);

  // Center view on initial load
  useEffect(() => {
    if (!hasInitialized.current && width > 0 && height > 0) {
      // Small delay to ensure canvas size is set and layout is stable
      const timer = setTimeout(() => {
        zoomToFit();
        hasInitialized.current = true;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [width, height, zoomToFit]);

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
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor }}
    >
      <StaticCanvas width={width} height={height} />
      <DynamicOverlay width={width} height={height} />

      <UserHint
        visible={!!hintMessage && !hintDismissed}
        message={hintMessage}
        onClose={() => setHintDismissed(true)}
      />
    </div>
  );
};

export default CanvasManager;
