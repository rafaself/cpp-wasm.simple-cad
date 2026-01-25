import React from 'react';

import { InlinePolygonInput } from '@/features/editor/components/InlinePolygonInput';

type ScreenPoint = { x: number; y: number };
type WorldPoint = { x: number; y: number };

export class PolygonModalController {
  private open = false;
  private center: WorldPoint | null = null;
  private screenPos: ScreenPoint | null = null;
  private sides = 3;

  constructor(
    private readonly onChange: () => void,
    initialSides: number,
  ) {
    this.sides = initialSides;
  }

  isOpen(): boolean {
    return this.open;
  }

  getCenter(): WorldPoint | null {
    return this.center;
  }

  getSides(): number {
    return this.sides;
  }

  setSides(value: number): void {
    this.sides = value;
  }

  syncSides(value: number): void {
    this.sides = value;
  }

  openAt(center: WorldPoint, screenPos: ScreenPoint): void {
    this.open = true;
    this.center = center;
    this.screenPos = screenPos;
    this.onChange();
  }

  close(): void {
    this.open = false;
    this.center = null;
    this.screenPos = null;
    this.onChange();
  }

  render(onConfirm: (sides: number) => void, onCancel: () => void): React.ReactNode {
    if (!this.open || !this.screenPos) return null;

    return React.createElement(InlinePolygonInput, {
      screenPosition: this.screenPos,
      initialValue: this.sides,
      onConfirm,
      onCancel,
      minSides: 3,
      maxSides: 30,
    });
  }
}
