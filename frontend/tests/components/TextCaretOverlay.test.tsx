import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { TextCaretOverlay } from '@/components/TextCaretOverlay';

const baseProps = {
  caret: { x: 0, y: 0, height: 12, visible: true },
  selectionRects: [],
  anchor: { x: 0, y: 0 },
  rotation: 0,
  caretColor: 'rgb(255, 255, 255)',
  selectionColor: 'rgb(0, 255, 0)',
  blinkInterval: 0,
};

const renderCaret = (scale: number) => {
  const { container } = render(
    <TextCaretOverlay {...baseProps} viewTransform={{ x: 0, y: 0, scale }} />,
  );
  const caretEl = container.querySelector('.absolute') as HTMLDivElement | null;
  expect(caretEl).not.toBeNull();
  return caretEl!;
};

describe('TextCaretOverlay', () => {
  it('keeps caret css width stable across zoom levels', () => {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const expectedWidth = `${1 / dpr}px`;

    const widthAtOne = window.getComputedStyle(renderCaret(1)).width;
    const widthAtFour = window.getComputedStyle(renderCaret(4)).width;

    expect(widthAtOne).toBe(expectedWidth);
    expect(widthAtFour).toBe(widthAtOne);
  });
});
