/**
 * Command Parser
 *
 * Parses command input strings into structured command objects.
 * Supports:
 * - Simple commands: "LINE", "L"
 * - Commands with arguments: "ZOOM 150", "SNAP ON"
 * - Quoted string arguments: "TEXT \"Hello World\""
 */

export interface ParseSuccess {
  success: true;
  command: string; // Normalized to uppercase
  args: string[]; // Raw argument strings
}

export interface ParseError {
  success: false;
  error: string;
  position?: number; // Character position of error (optional)
}

export type ParseResult = ParseSuccess | ParseError;

/**
 * Tokenizes input string, handling quoted strings.
 *
 * Rules:
 * - Splits on whitespace
 * - Quoted strings (single or double) are kept as single tokens
 * - Escaped quotes inside strings are handled: \" or \'
 */
function tokenize(input: string): string[] | ParseError {
  const tokens: string[] = [];
  let current = '';
  let inQuote: '"' | "'" | null = null;
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (inQuote) {
      // Inside a quoted string
      if (char === '\\' && i + 1 < input.length) {
        // Escape sequence
        const next = input[i + 1];
        if (next === inQuote || next === '\\') {
          current += next;
          i += 2;
          continue;
        }
      }

      if (char === inQuote) {
        // End of quoted string
        tokens.push(current);
        current = '';
        inQuote = null;
        i++;
        continue;
      }

      current += char;
      i++;
    } else {
      // Not in a quoted string
      if (char === '"' || char === "'") {
        // Start of quoted string
        if (current) {
          tokens.push(current);
          current = '';
        }
        inQuote = char;
        i++;
        continue;
      }

      if (/\s/.test(char)) {
        // Whitespace - end of token
        if (current) {
          tokens.push(current);
          current = '';
        }
        i++;
        continue;
      }

      current += char;
      i++;
    }
  }

  // Handle unclosed quote
  if (inQuote) {
    return {
      success: false,
      error: `Unclosed ${inQuote === '"' ? 'double' : 'single'} quote`,
      position: input.lastIndexOf(inQuote),
    };
  }

  // Add remaining token
  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parses a command input string.
 *
 * @param input - The raw command string (e.g., "LINE", "ZOOM 150")
 * @returns ParseResult - Either success with command/args or error
 */
export function parseCommand(input: string): ParseResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return { success: false, error: 'Empty command' };
  }

  const tokensOrError = tokenize(trimmed);

  if (!Array.isArray(tokensOrError)) {
    return tokensOrError; // It's a ParseError
  }

  const tokens = tokensOrError;

  if (tokens.length === 0) {
    return { success: false, error: 'Empty command' };
  }

  const command = tokens[0].toUpperCase();
  const args = tokens.slice(1);

  return { success: true, command, args };
}

/**
 * Validates and coerces an argument to a number.
 */
export function parseNumberArg(arg: string): number | null {
  const num = parseFloat(arg);
  return isNaN(num) ? null : num;
}

/**
 * Validates an argument as a boolean-like value.
 */
export function parseBooleanArg(arg: string): boolean | null {
  const upper = arg.toUpperCase();
  if (upper === 'ON' || upper === 'TRUE' || upper === '1' || upper === 'YES') {
    return true;
  }
  if (upper === 'OFF' || upper === 'FALSE' || upper === '0' || upper === 'NO') {
    return false;
  }
  return null;
}

/**
 * Validates an argument against a set of allowed values (case-insensitive).
 */
export function parseEnumArg<T extends string>(arg: string, allowed: readonly T[]): T | null {
  const upper = arg.toUpperCase();
  for (const value of allowed) {
    if (value.toUpperCase() === upper) {
      return value;
    }
  }
  return null;
}
