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
  // DEBUG: Output UV coordinates as color to verify geometry is correct
  // Red = U coordinate, Green = V coordinate, Blue = texture sample to keep uniform
  float texSample = texture(u_atlas, v_texcoord).r * 0.001;
  float pxMod = u_pxRange * 0.0001;  // Keep uniform referenced
  outColor = vec4(v_texcoord.x + texSample + pxMod, v_texcoord.y, 0.5, 1.0);
  // If we see colored squares, geometry is correct. Colors should be:
  // - Top-left corner: dark (u=0, v=0)
  // - varying red (u increases right)
  // - varying green (v increases down)
  return;

  // Sample the MSDF texture
  vec3 msd = texture(u_atlas, v_texcoord).rgb;

  // Compute signed distance from the median
  float sd = median(msd.r, msd.g, msd.b);

  // Compute screen-space distance for proper antialiasing
  // This uses the derivative of the texture coordinates to determine
  // how much the distance field changes per screen pixel
  vec2 unitRange = vec2(u_pxRange) / vec2(textureSize(u_atlas, 0));
  vec2 screenTexSize = vec2(1.0) / fwidth(v_texcoord);
  float screenPxRange = max(0.5 * dot(unitRange, screenTexSize), 1.0);

  // Convert signed distance to opacity
  // sd = 0.5 is the edge of the glyph
  // screenPxRange controls the sharpness of antialiasing
  float screenPxDistance = screenPxRange * (sd - 0.5);
  float opacity = clamp(screenPxDistance + 0.5, 0.0, 1.0);

  // Output final color with computed opacity
  outColor = vec4(v_color.rgb, v_color.a * opacity);

  // Discard fully transparent pixels for better blending
  if (outColor.a < 0.004) discard;
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
export const DEFAULT_MSDF_PX_RANGE = 4.0;
