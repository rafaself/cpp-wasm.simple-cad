#pragma once

/**
 * @file interaction_constants.h
 * @brief Centralized constants for interaction system.
 * 
 * This file is the SINGLE SOURCE OF TRUTH for all interaction-related constants.
 * Frontend constants in interaction-constants.ts MUST mirror these values.
 * 
 * Handle Index Order (Engine Authority):
 *   0 = Bottom-Left (BL)
 *   1 = Bottom-Right (BR)
 *   2 = Top-Right (TR)
 *   3 = Top-Left (TL)
 * 
 * Side Handle Index:
 *   0 = South (Bottom)
 *   1 = East (Right)
 *   2 = North (Top)
 *   3 = West (Left)
 */

namespace interaction_constants {

// =============================================================================
// Pick/Hit-test Tolerances (in screen pixels, converted to world via viewScale)
// =============================================================================

/// Tolerance for general picking (body, edges, vertices)
constexpr float PICK_TOLERANCE_PX = 10.0f;

/// Size of resize handle hit area (half-width of square handle)
constexpr float RESIZE_HANDLE_SIZE_PX = 5.0f;

/// Diagonal offset from corner to rotation handle center
constexpr float ROTATE_HANDLE_OFFSET_PX = 15.0f;

/// Radius of rotation handle hit area
constexpr float ROTATE_HANDLE_RADIUS_PX = 10.0f;

// =============================================================================
// Drag Thresholds (in screen pixels)
// =============================================================================

/// Minimum drag distance to start a transform (prevents accidental moves on click)
constexpr float DRAG_THRESHOLD_PX = 3.0f;

/// Minimum delta for axis lock detection
constexpr float AXIS_LOCK_MIN_DELTA_PX = 4.0f;

// =============================================================================
// Axis Lock Ratios
// =============================================================================

/// Ratio threshold to enter axis lock mode (delta_major / delta_minor)
constexpr float AXIS_LOCK_ENTER_RATIO = 1.1f;

/// Ratio threshold to switch axis lock direction
constexpr float AXIS_LOCK_SWITCH_RATIO = 1.2f;

// =============================================================================
// Rotation Snapping
// =============================================================================

/// Angle increment for shift-snap rotation (in degrees)
constexpr float ROTATION_SNAP_DEGREES = 15.0f;

/// Angle increment for vertex/line shift-snap (in radians, 45°)
constexpr float VERTEX_SNAP_ANGLE_RAD = 0.785398163f;  // π/4

// =============================================================================
// Side Handle Resize
// =============================================================================

/// Corner exclusion zone for side handles (prevents overlap with corner handles)
constexpr float SIDE_HANDLE_CORNER_EXCLUSION_FACTOR = 1.5f;

// =============================================================================
// Visual Rendering
// =============================================================================

/// Default stroke width for selection overlay (in pixels)
constexpr float SELECTION_STROKE_WIDTH_PX = 1.0f;

/// Handle square size for rendering (in pixels)
constexpr float HANDLE_RENDER_SIZE_PX = 8.0f;

// =============================================================================
// Handle Index Constants (Engine Authority)
// =============================================================================

/// Corner handle indices (clockwise from bottom-left)
namespace CornerIndex {
    constexpr int BOTTOM_LEFT = 0;
    constexpr int BOTTOM_RIGHT = 1;
    constexpr int TOP_RIGHT = 2;
    constexpr int TOP_LEFT = 3;
}

/// Side handle indices
namespace SideIndex {
    constexpr int SOUTH = 0;  // Bottom
    constexpr int EAST = 1;   // Right
    constexpr int NORTH = 2;  // Top
    constexpr int WEST = 3;   // Left
}

/// Base angles for cursor direction (degrees, 0° = East/Right)
namespace CursorBaseAngle {
    constexpr float BOTTOM_LEFT = 225.0f;   // SW diagonal
    constexpr float BOTTOM_RIGHT = 315.0f;  // SE diagonal
    constexpr float TOP_RIGHT = 45.0f;      // NE diagonal
    constexpr float TOP_LEFT = 135.0f;      // NW diagonal
    constexpr float SOUTH = 270.0f;         // Down
    constexpr float EAST = 0.0f;            // Right
    constexpr float NORTH = 90.0f;          // Up
    constexpr float WEST = 180.0f;          // Left
}

} // namespace interaction_constants
