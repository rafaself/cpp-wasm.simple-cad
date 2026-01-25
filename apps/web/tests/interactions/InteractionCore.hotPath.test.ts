import { describe, it, expect } from 'vitest';

import { InteractionCore } from '@/features/editor/interactions/interactionCore';

describe('InteractionCore hot path invariants', () => {
  it('reuses pointer context objects between pointer moves', () => {
    const pointerRectRef = { current: { left: 0, top: 0 } };
    const viewTransform = { x: 0, y: 0, scale: 1 };
    const canvasSize = { width: 300, height: 300 };
    const toolDefaults = {
      strokeColor: '#fff',
      fillColor: '#000',
      fillEnabled: true,
      strokeEnabled: true,
      strokeWidth: 1,
      polygonSides: 3,
    };

    const core = new InteractionCore(
      pointerRectRef as any,
      viewTransform,
      canvasSize,
      toolDefaults as any,
    );
    core.setRuntime({
      viewport: {
        screenToWorldWithTransformInto: (screen: any, _transform: any, out: any) => {
          out.x = screen.x;
          out.y = screen.y;
        },
      },
    } as any);

    core.handlePointerMove({ clientX: 10, clientY: 20 } as any);
    const ctxRef = (core as any).ctxRef;
    const screenRef = ctxRef.screenPoint;
    const worldRef = ctxRef.worldPoint;

    core.handlePointerMove({ clientX: 12, clientY: 22 } as any);
    const ctxRefNext = (core as any).ctxRef;

    expect(ctxRefNext.screenPoint).toBe(screenRef);
    expect(ctxRefNext.worldPoint).toBe(worldRef);
  });
});
