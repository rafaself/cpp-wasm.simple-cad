/**
 * Generates a secure random UUID (v4).
 * Uses crypto.randomUUID if available, otherwise falls back to a pseudo-random implementation.
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback for environments where crypto.randomUUID is not available
  // Note: This is not cryptographically secure, but sufficient for non-security-critical unique IDs
  // if the environment is strictly legacy. Modern browsers and Node.js support randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
