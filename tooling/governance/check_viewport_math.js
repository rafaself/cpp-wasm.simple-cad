const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../');
const FEATURES_DIR = path.join(ROOT_DIR, 'apps/web/features');

const FILE_EXTENSIONS = ['.ts', '.tsx'];

const SCREEN_TO_WORLD_REGEX = /\bscreenToWorld\s*\(/;
const SCREEN_TO_WORLD_IMPORT_REGEX = /import\s*{[^}]*\bscreenToWorld\b[^}]*}\s*from\s*['"][^'"]*viewportMath['"]/;

let hasError = false;

const isCodeLine = (line, state) => {
  const trimmed = line.trim();
  if (state.inBlock) {
    if (trimmed.includes('*/')) {
      state.inBlock = false;
    }
    return false;
  }
  if (trimmed.startsWith('/*')) {
    if (!trimmed.includes('*/')) {
      state.inBlock = true;
    }
    return false;
  }
  if (trimmed.startsWith('//')) return false;
  return true;
};

const walk = (dir, acc = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, acc);
      return;
    }
    if (FILE_EXTENSIONS.includes(path.extname(entry.name))) {
      acc.push(fullPath);
    }
  });
  return acc;
};

console.log('Checking for forbidden screenToWorld usage in UI code...');

const files = walk(FEATURES_DIR);
files.forEach((file) => {
  const relPath = path.relative(ROOT_DIR, file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const state = { inBlock: false };

  lines.forEach((line, index) => {
    if (!isCodeLine(line, state)) return;

    if (SCREEN_TO_WORLD_IMPORT_REGEX.test(line)) {
      console.error(`ERROR: screenToWorld import found in ${relPath}:${index + 1}`);
      console.error(`       ${line.trim()}`);
      console.error('       Use runtime.viewport.screenToWorldWithTransform* instead.');
      hasError = true;
      return;
    }

    if (SCREEN_TO_WORLD_REGEX.test(line)) {
      console.error(`ERROR: screenToWorld usage found in ${relPath}:${index + 1}`);
      console.error(`       ${line.trim()}`);
      console.error('       Use runtime.viewport.screenToWorldWithTransform* instead.');
      hasError = true;
    }
  });
});

if (hasError) {
  console.error('\nFAILURE: Forbidden viewport math usage detected.');
  process.exit(1);
} else {
  console.log('SUCCESS: No forbidden screenToWorld usage found.');
}
