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
  caretColor = '#000000',
  selectionColor = 'rgba(59, 130, 246, 0.3)', // blue-500 with opacity
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

  // Transform world coordinates to screen coordinates
  const worldToScreen = (worldX: number, worldY: number) => {
    return {
      x: worldX * viewTransform.scale + viewTransform.x,
      y: -worldY * viewTransform.scale + viewTransform.y, // Y is flipped
    };
  };

  // Don't render if not active
  if (!caret.visible && selectionRects.length === 0) {
    return null;
  }

  // Calculate caret screen position
  const caretScreen = worldToScreen(caret.x, caret.y);
  const caretHeightScreen = caret.height * viewTransform.scale;

  // Render selection rectangles
  const renderSelectionRects = () => {
    return selectionRects.map((rect, index) => {
      const topLeft = worldToScreen(rect.x, rect.y + rect.height);
      const widthScreen = rect.width * viewTransform.scale;
      const heightScreen = rect.height * viewTransform.scale;

      return (
        <div
          key={`selection-${index}`}
          className="absolute pointer-events-none"
          style={{
            left: topLeft.x,
            top: topLeft.y,
            width: widthScreen,
            height: heightScreen,
            backgroundColor: selectionColor,
          }}
        />
      );
    });
  };

  // Render caret
  const renderCaret = () => {
    if (!caret.visible || !caretVisible) return null;

    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: caretScreen.x,
          top: caretScreen.y - caretHeightScreen,
          width: 2,
          height: caretHeightScreen,
          backgroundColor: caretColor,
        }}
      />
    );
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
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
  setCaret: (x: number, y: number, height: number) => void;
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

  const [selectionRects, setSelectionRects] = useState<TextSelectionRect[]>([]);

  const updateCaret = (x: number, y: number, height: number) => {
    setCaret((prev) => ({
      ...prev,
      x,
      y,
      height,
      visible: true,
    }));
  };

  const showCaret = () => {
    setCaret((prev) => ({ ...prev, visible: true }));
  };

  const hideCaret = () => {
    setCaret((prev) => ({ ...prev, visible: false }));
  };

  const clearSelection = () => {
    setSelectionRects([]);
  };

  return {
    caret,
    selectionRects,
    setCaret: updateCaret,
    setSelection: setSelectionRects,
    showCaret,
    hideCaret,
    clearSelection,
  };
}

export default TextCaretOverlay;
