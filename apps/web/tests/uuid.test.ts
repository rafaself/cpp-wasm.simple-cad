import { describe, it, expect, vi, afterEach } from 'vitest';

import { generateId } from '../utils/uuid';

describe('generateId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(10);
  });

  it('respects prefix', () => {
    const id = generateId('test');
    expect(id).toMatch(/^test-/);
  });

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => 'uuid-1234');
    vi.stubGlobal('crypto', { randomUUID });

    const id = generateId();
    expect(id).toBe('uuid-1234');
    expect(randomUUID).toHaveBeenCalled();
  });

  it('uses crypto.getRandomValues when randomUUID is missing', () => {
    const getRandomValues = vi.fn((arr) => {
      // Fill with deterministic values for testing
      for (let i = 0; i < arr.length; i++) {
        arr[i] = 128; // 0x80
      }
      return arr;
    });

    vi.stubGlobal('crypto', { getRandomValues });

    const id = generateId();

    expect(getRandomValues).toHaveBeenCalled();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('falls back to Math.random when crypto is missing', () => {
    vi.stubGlobal('crypto', undefined);
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(10);
  });
});
