/**
 * Type Guards and Runtime Security Validation
 * 
 * Provides runtime validation for critical data structures to prevent
 * injection of malformed data and ensure type safety beyond compile time.
 */

import { PickEntityKind, PickSubTarget, type PickResult } from '@/types/picking';

/**
 * Checks if a value is a valid finite number
 * Prevents NaN, Infinity, and non-numeric types from propagating
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Checks if a value is a valid positive number (>= 0)
 */
export function isPositiveNumber(value: unknown): value is number {
  return isValidNumber(value) && value >= 0;
}

/**
 * Validates if an object structure matches PickResult interface
 * Used when initializing cache from unknown sources or validating inputs
 */
export function isPickResult(value: unknown): value is PickResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<PickResult>;

  return (
    isValidNumber(candidate.id) &&
    isValidNumber(candidate.kind) &&
    // Validate enum ranges if checking strictly, but number check is basic safety
    isValidNumber(candidate.subTarget) &&
    isValidNumber(candidate.subIndex) &&
    isValidNumber(candidate.distance)
  );
}

/**
 * Validates PickEntityKind enum membership
 */
export function isPickEntityKind(value: unknown): value is PickEntityKind {
  return isValidNumber(value) && Object.values(PickEntityKind).includes(value as PickEntityKind);
}

/**
 * Sanitizes a string input to prevent basic injection attacks
 * - Trims whitespace
 * - Limits length
 * - Removes dangerous characters (<, >)
 */
export function sanitizeString(input: unknown, maxLength = 100): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .slice(0, maxLength)
    .trim()
    .replace(/[<>]/g, ''); // Basic XSS prevention for simple display strings
}

/**
 * Safe JSON parser that returns null instead of throwing
 * Useful for processing untrusted local storage or url params
 */
export function safeJsonParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
