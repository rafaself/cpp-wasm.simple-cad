import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const FORBIDDEN_FILES = [
  path.join(FRONTEND_ROOT, 'stores', 'useDataStore.ts'),
  path.join(FRONTEND_ROOT, 'engine', 'core', 'useEngineStoreSync.ts'),
];

const collectFiles = (dirPath: string): string[] => {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...collectFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

describe('document store removal gate', () => {
  it('removes forbidden store files', () => {
    const existing = FORBIDDEN_FILES.filter((file) => fs.existsSync(file));
    expect(existing).toEqual([]);
  });

  it('avoids imports of removed document stores', () => {
    const violations: string[] = [];
    const files = collectFiles(FRONTEND_ROOT);
    for (const filePath of files) {
      if (filePath === __filename) continue;
      const source = fs.readFileSync(filePath, 'utf8');
      if (source.includes('useDataStore') || source.includes('useEngineStoreSync')) {
        violations.push(path.relative(FRONTEND_ROOT, filePath));
      }
    }
    expect(violations).toEqual([]);
  });
});
