import { describe, expect, it } from 'vitest';

import { resolveTessellatedBackend } from '../engine/renderers/tessellatedBackend';

describe('resolveTessellatedBackend', () => {
  it('uses WebGL2 for legacy mode regardless of support', () => {
    expect(resolveTessellatedBackend('legacy', true)).toBe('webgl2');
    expect(resolveTessellatedBackend('legacy', false)).toBe('webgl2');
  });

  it('uses WebGL2 for explicit webgl2 mode', () => {
    expect(resolveTessellatedBackend('webgl2', true)).toBe('webgl2');
    expect(resolveTessellatedBackend('webgl2', false)).toBe('webgl2');
  });

  it('uses WebGPU only when supported', () => {
    expect(resolveTessellatedBackend('webgpu', true)).toBe('webgpu');
    expect(resolveTessellatedBackend('webgpu', false)).toBe('webgl2');
  });
});

