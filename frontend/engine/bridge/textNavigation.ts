/**
 * Text Navigation - Engine-level text navigation and encoding utilities
 *
 * Provides character navigation (word boundaries, line boundaries) and
 * UTF-8 byte/character index conversion utilities.
 */

import { utf8ByteLength } from '@/types/text';
import type { TextEnabledCadEngine } from './textBridge';

/**
 * Text navigation helper that wraps engine navigation methods
 * with proper byte/char index conversion.
 */
export class TextNavigator {
  constructor(
    private textEngine: TextEnabledCadEngine,
    private isAvailable: () => boolean
  ) {}

  /** Get visual previous caret position. */
  getVisualPrev(textId: number, charIndex: number, content: string): number {
    if (!this.isAvailable()) return charIndex;
    const byteIndex = charToByteIndex(content, charIndex);
    const prevByte = this.textEngine.getVisualPrevCharIndex(textId, byteIndex);
    return byteToCharIndex(content, prevByte);
  }

  /** Get visual next caret position. */
  getVisualNext(textId: number, charIndex: number, content: string): number {
    if (!this.isAvailable()) return charIndex;
    const byteIndex = charToByteIndex(content, charIndex);
    const nextByte = this.textEngine.getVisualNextCharIndex(textId, byteIndex);
    return byteToCharIndex(content, nextByte);
  }

  /** Get word left boundary. */
  getWordLeft(textId: number, charIndex: number, content: string): number {
    if (!this.isAvailable()) return 0;
    const byteIndex = charToByteIndex(content, charIndex);
    const prevByte = this.textEngine.getWordLeftIndex(textId, byteIndex);
    return byteToCharIndex(content, prevByte);
  }

  /** Get word right boundary. */
  getWordRight(textId: number, charIndex: number, content: string): number {
    if (!this.isAvailable()) return charIndex;
    const byteIndex = charToByteIndex(content, charIndex);
    const nextByte = this.textEngine.getWordRightIndex(textId, byteIndex);
    return byteToCharIndex(content, nextByte);
  }

  /** Get line start boundary. */
  getLineStart(textId: number, charIndex: number, content: string): number {
    if (!this.isAvailable()) return 0;
    const byteIndex = charToByteIndex(content, charIndex);
    const prevByte = this.textEngine.getLineStartIndex(textId, byteIndex);
    return byteToCharIndex(content, prevByte);
  }

  /** Get line end boundary. */
  getLineEnd(textId: number, charIndex: number, content: string): number {
    if (!this.isAvailable()) return charIndex;
    const byteIndex = charToByteIndex(content, charIndex);
    const nextByte = this.textEngine.getLineEndIndex(textId, byteIndex);
    return byteToCharIndex(content, nextByte);
  }

  /** Get line up boundary. */
  getLineUp(textId: number, charIndex: number, content: string): number {
    if (!this.isAvailable()) return charIndex;
    const byteIndex = charToByteIndex(content, charIndex);
    const resultByte = this.textEngine.getLineUpIndex(textId, byteIndex);
    return byteToCharIndex(content, resultByte);
  }

  /** Get line down boundary. */
  getLineDown(textId: number, charIndex: number, content: string): number {
    if (!this.isAvailable()) return charIndex;
    const byteIndex = charToByteIndex(content, charIndex);
    const resultByte = this.textEngine.getLineDownIndex(textId, byteIndex);
    return byteToCharIndex(content, resultByte);
  }
}

/**
 * Convert character index to UTF-8 byte index.
 */
export function charToByteIndex(content: string, charIndex: number): number {
  const prefix = content.slice(0, charIndex);
  return utf8ByteLength(prefix);
}

/**
 * Convert UTF-8 byte index to character index.
 */
export function byteToCharIndex(content: string, byteIndex: number): number {
  // Fast path for ASCII
  if (byteIndex < content.length && /^[\x00-\x7F]*$/.test(content)) {
    return byteIndex;
  }

  let currentByte = 0;
  const len = content.length;
  for (let i = 0; i < len; i++) {
    if (currentByte >= byteIndex) return i;
    const code = content.charCodeAt(i);
    // High surrogate
    if (code >= 0xD800 && code <= 0xDBFF) {
      // 4 bytes in UTF-8
      currentByte += 4;
      i++; // Skip low surrogate
    } else if (code >= 0x80) {
      // 2 or 3 bytes
      if (code < 0x800) currentByte += 2;
      else currentByte += 3;
    } else {
      currentByte += 1;
    }
  }
  return len;
}
