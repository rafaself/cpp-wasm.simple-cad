/**
 * Generates a secure unique identifier using crypto.randomUUID() where available.
 *
 * @param prefix Optional prefix to prepend to the UUID (e.g. 'shape', 'node')
 * @returns A unique string identifier
 */
export const generateId = (prefix?: string): string => {
  let uuid: string;

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    uuid = crypto.randomUUID();
  } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    // CSP-safe, higher entropy fallback than Math.random()
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const randomByte = crypto.getRandomValues(new Uint8Array(1))[0];
      const r = randomByte % 16;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  } else {
    // Fallback for environments without crypto.randomUUID or getRandomValues
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  return prefix ? `${prefix}-${uuid}` : uuid;
};
