import { describe, it, expect } from 'vitest';
import { DEFAULT_MSDF_PX_RANGE, TEXT_MSDF_FRAGMENT_SOURCE } from './textMsdf';

describe('Text Rendering Configuration', () => {
  it('Exported MSDF Pixel Range constant should be 8.0 (matching C++)', () => {
    // This JS constant is used by the RenderPass to set the 'u_pxRange' uniform.
    // It must match the value configured in the C++ Engine (GlyphAtlas), 
    // otherwise text will appear too fat or too thin/wobbly.
    expect(DEFAULT_MSDF_PX_RANGE).toBe(8.0);
  });

  it('Fragment shader should support dynamic pixel range via uniform', () => {
     // Verify that the shader source actually declares the uniform we intend to control
     expect(TEXT_MSDF_FRAGMENT_SOURCE).toContain('uniform float u_pxRange;');
  });
});
