import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = [path.join(FRONTEND_ROOT, 'features'), path.join(FRONTEND_ROOT, 'hooks')];

const isGateFile = (filePath: string): boolean => {
  const rel = path.relative(FRONTEND_ROOT, filePath).split(path.sep).join('/');
  if (rel.startsWith('features/') && /\/Overlay[^/]*\.(ts|tsx|js|jsx)$/.test(rel)) return true;
  if (rel.startsWith('features/') && /\/Interaction[^/]*\.(ts|tsx|js|jsx)$/.test(rel)) return true;
  if (rel.startsWith('hooks/') && /\/Interaction[^/]*\.(ts|tsx|js|jsx)$/.test(rel)) return true;
  return false;
};

const collectFiles = (dirPath: string): string[] => {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

const extractImportPaths = (source: string): string[] => {
  const paths: string[] = [];
  const importRegex = /from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null = null;
  while ((match = importRegex.exec(source)) !== null) {
    const mod = match[1] || match[2] || match[3];
    if (mod) paths.push(mod);
  }
  return paths;
};

describe('interaction/overlay geometry gate', () => {
  it('avoids shape geometry imports in overlay/interaction surfaces', () => {
    const violations: string[] = [];
    const files = TARGET_DIRS.flatMap(collectFiles).filter(isGateFile);
    for (const filePath of files) {
      const source = fs.readFileSync(filePath, 'utf8');
      const importPaths = extractImportPaths(source);
      for (const mod of importPaths) {
        if (mod.includes('utils/geometry') || mod.includes('shapeGeometry')) {
          violations.push(`${path.relative(FRONTEND_ROOT, filePath)} -> ${mod}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
