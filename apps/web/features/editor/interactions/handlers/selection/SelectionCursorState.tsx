import React from 'react';

import { MoveCursor } from '@/features/editor/components/MoveCursor';
import { ResizeCursor } from '@/features/editor/components/ResizeCursor';
import { RotationCursor } from '@/features/editor/components/RotationCursor';

type ScreenPoint = { x: number; y: number };

export class SelectionCursorState {
  private cursorAngle = 0;
  private cursorScreenPos: ScreenPoint | null = null;
  private showRotationCursor = false;
  private showResizeCursor = false;
  private showMoveCursor = false;

  reset(): void {
    this.showRotationCursor = false;
    this.showResizeCursor = false;
    this.showMoveCursor = false;
    this.cursorScreenPos = null;
  }

  showRotationAt(screen: ScreenPoint, angle: number): void {
    this.showRotationCursor = true;
    this.showResizeCursor = false;
    this.showMoveCursor = false;
    this.cursorAngle = angle;
    this.cursorScreenPos = screen;
  }

  showResizeAt(screen: ScreenPoint, angle: number): void {
    this.showRotationCursor = false;
    this.showResizeCursor = true;
    this.showMoveCursor = false;
    this.cursorAngle = angle;
    this.cursorScreenPos = screen;
  }

  showMoveAt(screen: ScreenPoint): void {
    this.showRotationCursor = false;
    this.showResizeCursor = false;
    this.showMoveCursor = true;
    this.cursorScreenPos = screen;
  }

  isVisible(): boolean {
    return this.showRotationCursor || this.showResizeCursor || this.showMoveCursor;
  }

  renderOverlay(): React.ReactNode {
    if (!this.cursorScreenPos) return null;

    if (this.showRotationCursor) {
      return (
        <RotationCursor
          key="cursor-rot"
          x={this.cursorScreenPos.x}
          y={this.cursorScreenPos.y}
          rotation={this.cursorAngle}
        />
      );
    }

    if (this.showResizeCursor) {
      return (
        <ResizeCursor
          key="cursor-res"
          x={this.cursorScreenPos.x}
          y={this.cursorScreenPos.y}
          rotation={this.cursorAngle}
        />
      );
    }

    if (this.showMoveCursor) {
      return <MoveCursor key="cursor-move" x={this.cursorScreenPos.x} y={this.cursorScreenPos.y} />;
    }

    return null;
  }
}
