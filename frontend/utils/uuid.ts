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
    // Generate 16 bytes at once for better performance than calling per-character
    const rnds = new Uint8Array(16);
    crypto.getRandomValues(rnds);

    // Set version (4) and variant (10xx -> 8, 9, a, b)
    rnds[6] = (rnds[6] & 0x0f) | 0x40;
    rnds[8] = (rnds[8] & 0x3f) | 0x80;

    const hex = (b: number) => b.toString(16).padStart(2, '0');

    uuid =
      hex(rnds[0]) +
      hex(rnds[1]) +
      hex(rnds[2]) +
      hex(rnds[3]) +
      '-' +
      hex(rnds[4]) +
      hex(rnds[5]) +
      '-' +
      hex(rnds[6]) +
      hex(rnds[7]) +
      '-' +
      hex(rnds[8]) +
      hex(rnds[9]) +
      '-' +
      hex(rnds[10]) +
      hex(rnds[11]) +
      hex(rnds[12]) +
      hex(rnds[13]) +
      hex(rnds[14]) +
      hex(rnds[15]);
  } else {
    // Fallback for environments without crypto.randomUUID or getRandomValues
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0,
        v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  return prefix ? `${prefix}-${uuid}` : uuid;
};
