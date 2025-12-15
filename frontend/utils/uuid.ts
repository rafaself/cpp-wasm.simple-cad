/**
 * Generates a secure unique identifier using crypto.randomUUID() where available.
 *
 * @param prefix Optional prefix to prepend to the UUID (e.g. 'shape', 'node')
 * @returns A unique string identifier
 */
export const generateId = (prefix?: string): string => {
  let uuid: string;

  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    uuid = crypto.randomUUID();
  } else {
    // Fallback for environments without crypto.randomUUID
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  return prefix ? `${prefix}-${uuid}` : uuid;
};
