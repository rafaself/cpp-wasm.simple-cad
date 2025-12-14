
import { Point, ViewTransform } from '../types';

/**
 * Calculates the new ViewTransform based on wheel delta.
 * Uses an exponential function to normalize zoom speed across different input devices (trackpad vs mouse).
 *
 * @param currentTransform - The current ViewTransform state
 * @param mousePos - The current mouse position (screen coordinates)
 * @param deltaY - The raw deltaY from the wheel event
 * @param screenToWorldFn - Dependency injection for testing or avoiding circular imports
 * @returns The new ViewTransform
 */
export const calculateZoomTransform = (
    currentTransform: ViewTransform,
    mousePos: Point,
    deltaY: number,
    screenToWorldFn: (point: Point, transform: ViewTransform) => Point
): ViewTransform => {
    // Normalize delta to handle both mouse wheel and trackpad smooth scrolling
    const delta = -deltaY;

    // Use a smaller multiplier for smoother zoom.
    // Trackpads produce many small deltas (e.g. 1-10), Mouse wheels produce large (100).
    const zoomIntensity = 0.001;
    const scaleFactor = Math.exp(delta * zoomIntensity);

    let newScale = currentTransform.scale * scaleFactor;
    newScale = Math.max(0.01, Math.min(newScale, 50)); // Expanded zoom range

    const w = screenToWorldFn(mousePos, currentTransform);

    // Pivot zoom around cursor
    const newX = mousePos.x - w.x * newScale;
    const newY = mousePos.y - w.y * newScale;

    return { scale: newScale, x: newX, y: newY };
};
