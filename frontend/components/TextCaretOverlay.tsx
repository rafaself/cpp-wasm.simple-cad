/**
 * TextCaretOverlay - Visual overlay for text caret and selection
 *
 * This component renders:
 * - Blinking caret cursor at the current insertion point
 * - Selection highlight rectangles when text is selected
 *
 * It receives position data from the engine via TextTool callbacks
 * and transforms world coordinates to screen coordinates for rendering.
 */

import React, { useEffect, useState } from 'react';

import type { ViewTransform } from '@/types';
import type { TextSelectionRect } from '@/types/text';
import * as DEFAULTS from '@/theme/defaults';

// =============================================================================
// Types
// =============================================================================

export interface CaretPosition {
  /** X position in world coordinates */
  x: number;
  /** Y position in world coordinates */
  y: number;
  /** Height in world units */
  height: number;
  /** Whether caret is visible */
  visible: boolean;
}

export interface TextCaretOverlayProps {
  /** Current caret position from engine */
  caret: CaretPosition;
  /** Selection rectangles (empty if no selection) */
  selectionRects: TextSelectionRect[];
  /** View transform for world-to-screen conversion */
  viewTransform: ViewTransform;
  /** Text anchor position (World) */
  anchor: { x: number; y: number };
  /** Text rotation (radians) */
  rotation: number;
  /** Active editing bounds (local space), draws an outline when present */
  editingBounds?: { width: number; height: number } | null;
  /** Caret color */
  caretColor?: string;
  /** Selection highlight color */
  selectionColor?: string;
  /** Blink interval in ms (0 to disable) */
  blinkInterval?: number;
}

// =============================================================================
// Component
// =============================================================================

export const TextCaretOverlay: React.FC<TextCaretOverlayProps> = ({
  caret,
  selectionRects,
  viewTransform,
  anchor,
  rotation,
  editingBounds,
  caretColor = DEFAULTS.DEFAULT_STROKE_COLOR,
  selectionColor = DEFAULTS.DEFAULT_TEXT_SELECTION_COLOR,
  blinkInterval = 530,
}) => {
  const [caretVisible, setCaretVisible] = useState(true);

  // Blink effect
  useEffect(() => {
    if (!caret.visible || blinkInterval <= 0) {
      setCaretVisible(caret.visible);
      return;
    }

    // Reset visibility when caret moves
    setCaretVisible(true);

    const interval = setInterval(() => {
      setCaretVisible((v) => !v);
    }, blinkInterval);

    return () => clearInterval(interval);
  }, [caret.x, caret.y, caret.visible, blinkInterval]);

  // Don't render if not active
  if (!caret.visible && selectionRects.length === 0) {
    return null;
  }

  const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // Transform Logic:
  // 1. Position container at Anchor (Screen Coords)
  // 2. Rotate container by -rotation (matches view Y-flip logic usually, or just World Rotation)
  //    World Y is Up. Screen Y is Down.
  //    World Rotation positive = CCW.
  //    Screen Rotation positive = CW (visual).
  //    If we map World Rect to Screen Rect, we flip Y.
  //    ScreenY = -WorldY.
  //    Ideally we want CSS transform: translate(Sx, Sy) rotate(-R rad) scale(S).

  const screenAnchor = {
    x: anchor.x * viewTransform.scale + viewTransform.x,
    y: -anchor.y * viewTransform.scale + viewTransform.y,
  };

  // Convert rotation to degrees for CSS (CSS is CW for +deg)
  // World Rotation (radians CCW).
  // We need to verify direction.
  // If Text is 90 deg CCW (Vertical Up).
  // On Screen (Y Down), Up is -Y.
  // So visual rotation is -90 deg.
  // CSS rotate(-90deg) puts +X axis pointing Up (-Y). Correct.
  const rotationDeg = -(rotation * 180) / Math.PI;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: screenAnchor.x,
    top: screenAnchor.y,
    // Text engine already gives screen-facing Y; keep scale positive to avoid inverting caret motion.
    transform: `rotate(${rotationDeg}deg) scale(${viewTransform.scale})`,
    transformOrigin: '0 0', // Anchor is 0,0 locally
    pointerEvents: 'none',
  };

  // Render selection rectangles (Local Coords)
  const renderSelectionRects = () => {
    return selectionRects.map((rect, index) => (
      <div
        key={`selection-${index}`}
        className="absolute"
        style={{
          left: rect.x,
          // Engine is Y-Up (bottom is y, top is y + height).
          // CSS is Y-Down (top is value).
          // To get CSS Top from World Y-Up: Top_CSS = -(World_Y + Height).
          top: -(rect.y + rect.height),
          width: rect.width,
          height: rect.height,
          backgroundColor: selectionColor,
        }}
      />
    ));
  };

  // Render caret (Local Coords)
  const renderCaret = () => {
    // Hide caret when there is an active selection
    if (selectionRects.length > 0) return null;
    if (!caret.visible || !caretVisible) return null;

    const caretCssWidth = 1 / devicePixelRatio;

    return (
      <div
        className="absolute"
        style={{
          left: caret.x,
          // Engine Y is Y-Up world coords. pos.y is the top of the line.
          // CSS is Y-Down. So we negate it.
          top: -caret.y,
          width: caretCssWidth,
          height: caret.height,
          backgroundColor: caretColor,
          transform: `scaleX(${1 / viewTransform.scale})`,
          transformOrigin: '0 0',
        }}
      />
    );
  };

  // Debug visualization
  const debugRender = () => {
    // Check for dev flag (can be set in console: window.DEBUG_TEXT_OVERLAY = true)
    if (typeof window !== 'undefined' && !(window as any).DEBUG_TEXT_OVERLAY) return null;

    return (
      <div className="absolute top-0 left-0 pointer-events-none" style={{ zIndex: 9999 }}>
        {/* Origin Dot */}
        <div className="absolute w-2 h-2 rounded-full bg-red-500 -translate-x-1 -translate-y-1" />
        {/* Local X Axis (Text Flow Direction) */}
        <div className="absolute h-[1px] w-20 bg-red-500 origin-left" />
        {/* Local Y Axis (Line Stack Direction) */}
        <div className="absolute w-[1px] h-20 bg-blue-500 origin-top" />
        {/* Debug Label */}
        <div className="absolute top-2 left-2 text-[10px] bg-black/80 text-white px-1 whitespace-nowrap">
          Rot: {Math.round(rotationDeg)}°
        </div>
      </div>
    );
  };

  return (
    <div style={style}>
      {debugRender()}
      {editingBounds && editingBounds.width > 0 && editingBounds.height > 0 ? (
        <div
          className="absolute rounded-[1px] border border-primary/70"
          style={{
            left: 0,
            top: -editingBounds.height,
            width: editingBounds.width,
            height: editingBounds.height,
          }}
        />
      ) : null}
      {renderSelectionRects()}
      {renderCaret()}
    </div>
  );
};

// =============================================================================
// Hook for managing caret state
// =============================================================================

export interface UseTextCaretOptions {
  /** Initial caret color */
  caretColor?: string;
  /** Initial selection color */
  selectionColor?: string;
}

export interface UseTextCaretResult {
  caret: CaretPosition;
  selectionRects: TextSelectionRect[];
  anchor: { x: number; y: number };
  rotation: number;
  setCaret: (
    x: number,
    y: number,
    height: number,
    rotation?: number,
    anchorX?: number,
    anchorY?: number,
  ) => void;
  setSelection: (rects: TextSelectionRect[]) => void;
  showCaret: () => void;
  hideCaret: () => void;
  clearSelection: () => void;
}

/**
 * Hook for managing text caret and selection state.
 */
export function useTextCaret(options?: UseTextCaretOptions): UseTextCaretResult {
  const [caret, setCaret] = useState<CaretPosition>({
    x: 0,
    y: 0,
    height: 16,
    visible: false,
  });

  const [anchor, setAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0);

  const [selectionRects, setSelectionRects] = useState<TextSelectionRect[]>([]);

  const updateCaret = React.useCallback(
    (x: number, y: number, height: number, rot?: number, ancX?: number, ancY?: number) => {
      setCaret((prev) => ({
        ...prev,
        x,
        y,
        height,
        visible: true,
      }));
      if (rot !== undefined) setRotation(rot);
      if (ancX !== undefined && ancY !== undefined) setAnchor({ x: ancX, y: ancY });
    },
    [],
  );

  const showCaret = React.useCallback(() => {
    setCaret((prev) => ({ ...prev, visible: true }));
  }, []);

  const hideCaret = React.useCallback(() => {
    setCaret((prev) => ({ ...prev, visible: false }));
  }, []);

  const clearSelection = React.useCallback(() => {
    setSelectionRects([]);
  }, []);

  return {
    caret,
    selectionRects,
    anchor,
    rotation,
    setCaret: updateCaret,
    setSelection: setSelectionRects,
    showCaret,
    hideCaret,
    clearSelection,
  };
}

export default TextCaretOverlay;
