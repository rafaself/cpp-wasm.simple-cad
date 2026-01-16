const fs = require('fs');
const path = require('path');

const TAILWIND_SCALE_PATTERNS = [
  /\b(z-\d+|gap-\d+|text-(xs|sm|base|lg|xl|2xl|3xl))\b/,
  /\b(p|px|py|m|mx|my|w|h)-\d+\b/,
];

const ROOT_DIR = path.resolve(__dirname, '../../apps/web');
const ALLOWLIST_PATH = path.resolve(__dirname, 'allowlists/semantic_migration.json');

let allowlist = [];
try {
  const allowlistData = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  allowlist = allowlistData.files.map(f => path.resolve(__dirname, '../../', f));
} catch (e) {
  // Empty allowlist if file doesn't exist
}

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '.vite'].includes(file)) {
        arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
      }
    } else {
      if (['.tsx', '.ts'].some(ext => file.endsWith(ext))) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });
  return arrayOfFiles;
}

const files = getAllFiles(ROOT_DIR);
let warningCount = 0;

console.log('Checking for Tailwind scale values (Migration Warning)...');

files.forEach(file => {
  const relPath = path.relative(path.resolve(__dirname, '../../'), file);
  if (allowlist.includes(relPath)) {
    return;
  }

  // Primitives are allowed to use scale values for base definitions
  if (file.includes('components/ui/')) {
    return;
  }

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    for (const pattern of TAILWIND_SCALE_PATTERNS) {
      if (pattern.test(line)) {
        console.warn(`WARN: Tailwind scale value used in ${relPath}:${index + 1}`);
        console.warn(`      ${line.trim()}`);
        warningCount++;
      }
    }
  });
});

if (warningCount > 0) {
  console.warn(`\nDONE: Found ${warningCount} Tailwind scale usages. These should be migrated to semantic tokens by Q2 2026.`);
} else {
  console.log('SUCCESS: No non-semantic Tailwind scale values found.');
}
