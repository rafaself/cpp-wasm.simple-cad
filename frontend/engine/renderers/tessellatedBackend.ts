import type { RenderMode } from '@/stores/useSettingsStore';

export type TessellatedBackend = 'webgl2' | 'webgpu';

export const resolveTessellatedBackend = (mode: RenderMode, webgpuSupported: boolean): TessellatedBackend => {
  if (mode === 'webgpu' && webgpuSupported) return 'webgpu';
  return 'webgl2';
};

