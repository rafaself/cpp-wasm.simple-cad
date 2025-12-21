import { describe, expect, it } from 'vitest';

import { getNavigatorGpu, isWebgpuSupported } from '../engine/renderers/webgpu/webgpuSupport';

describe('webgpuSupport', () => {
  it('returns false when navigator is missing', () => {
    expect(getNavigatorGpu(undefined)).toBeNull();
    expect(isWebgpuSupported(undefined)).toBe(false);
  });

  it('returns false when navigator.gpu is missing', () => {
    expect(getNavigatorGpu({})).toBeNull();
    expect(isWebgpuSupported({})).toBe(false);
  });

  it('returns true when navigator.gpu exists', () => {
    expect(getNavigatorGpu({ gpu: {} })).not.toBeNull();
    expect(isWebgpuSupported({ gpu: {} })).toBe(true);
  });
});
