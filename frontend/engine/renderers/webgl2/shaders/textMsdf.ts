/**
 * MSDF Text Shader
 *
 * Renders multi-channel signed distance field (MSDF) text with proper antialiasing.
 * The MSDF technique allows crisp text rendering at any zoom level.
 *
 * Vertex format (per vertex, 6 vertices per glyph quad):
 *   [x, y, z, u, v, r, g, b, a] = 9 floats
 *
 * The shader uses the median of the RGB channels as the signed distance,
 * then converts to coverage using screen-space derivatives for proper antialiasing.
 */

// =============================================================================
// Vertex Shader
// =============================================================================

export const TEXT_MSDF_VERTEX_SOURCE = `#version 300 es
precision highp float;

// Vertex attributes (from engine quad buffer)
in vec3 a_position;   // x, y, z (world coordinates)
in vec2 a_texcoord;   // u, v (atlas UV)
in vec4 a_color;      // r, g, b, a (text color)

// Uniforms for view transformation
uniform float u_viewScale;
uniform vec2 u_viewTranslate;
uniform vec2 u_canvasSize;
uniform float u_pixelRatio;

// Varyings to fragment shader
out vec2 v_texcoord;
out vec4 v_color;

void main() {
  v_texcoord = a_texcoord;
  v_color = a_color;

  // Transform world position to screen position
  vec2 screen;
  screen.x = a_position.x * u_viewScale + u_viewTranslate.x;
  screen.y = -a_position.y * u_viewScale + u_viewTranslate.y;
  screen *= u_pixelRatio;

  // Convert to clip space
  // We use u_canvasSize (device pixels), same as screen coord system
  vec2 clip = vec2(
    (screen.x / u_canvasSize.x) * 2.0 - 1.0,
    1.0 - (screen.y / u_canvasSize.y) * 2.0
  );

  gl_Position = vec4(clip, a_position.z, 1.0);
}
`;

// =============================================================================
// Fragment Shader
// =============================================================================

export const TEXT_MSDF_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

// MSDF atlas texture
uniform sampler2D u_atlas;

// Screen pixel range - determines antialiasing sharpness
// This should match the range used when generating the MSDF atlas
// Typical values: 2.0 - 4.0 (we use 4.0 in GlyphAtlas)
uniform float u_pxRange;

// Varyings from vertex shader
in vec2 v_texcoord;
in vec4 v_color;

out vec4 outColor;

/**
 * Compute median of three values.
 * For MSDF, the median of RGB channels gives the true signed distance.
 */
float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  // Sample the MSDF texture
  vec3 msd = texture(u_atlas, v_texcoord).rgb;
  
  // Calculate signed distance (monotonic median)
  float sd = median(msd.r, msd.g, msd.b);
  
  // Compute screen-space distance for proper antialiasing at any zoom level
  // Get the range in texture units
  vec2 texSize = vec2(textureSize(u_atlas, 0));
  float unitRange = u_pxRange; // Range in texels
  
  // Convert distance to texture units
  // sd goes 0..1. Center at 0.5. Map to -0.5..0.5
  float distTexels = (sd - 0.5) * unitRange;
  
  // Convert texture units to screen pixels using derivatives
  // fwidth(v_texcoord) gives the change in UV per screen pixel
  // 1.0 / fwidth gives "screen pixels per UV unit"? No.
  // We want: How many texture units per screen pixel?
  // fwidth(v_texcoord * texSize) gives change in Texels per Screen Pixel.
  
  // Length of derivative vector for isotropic scaling (approx)
  // Or use fwidth on the distTexels directly?
  // Ideally, we want the gradient of the distance field in screen space.
  
  // Simplified approach widely used:
  // Convert distance field to screen pixels
  float screenPxDist = distTexels / fwidth(distTexels); 
  // Wait, fwidth(distTexels) is 0 inside the plateau. This is dangerous.
  
  // Correct standard approach:
  // Gradients of texture coordinates
  vec2 dTex = fwidth(v_texcoord) * texSize; 
  // Length of gradient vector = texels per screen pixel
  float texelsPerPixel = length(dTex); // Approximate
  
  // Distance in screen pixels
  float distScreen = distTexels / texelsPerPixel;
  
  // Compute opacity (anti-aliased edge)
  float opacity = clamp(distScreen + 0.5, 0.0, 1.0);
  
  // Output final color
  outColor = vec4(v_color.rgb, v_color.a * opacity);
  
  // Discard only fully transparent to save fillrate/blending work if needed
  if (opacity < 0.01) discard;
}
`;

// =============================================================================
// Shader Constants
// =============================================================================

/**
 * Number of floats per vertex in the text quad buffer.
 * Format: [x, y, z, u, v, r, g, b, a]
 */
export const TEXT_FLOATS_PER_VERTEX = 9;

/**
 * Number of vertices per glyph quad (2 triangles).
 */
export const TEXT_VERTICES_PER_GLYPH = 6;

/**
 * Default pixel range for MSDF rendering.
 * Should match the range used in GlyphAtlas generation.
 */
export const DEFAULT_MSDF_PX_RANGE = 8.0;
