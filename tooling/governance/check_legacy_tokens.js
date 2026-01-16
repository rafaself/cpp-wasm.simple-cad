const fs = require('fs');
const path = require('path');

const LEGACY_PATTERNS = [
  /\bbg-background\b/,
  // Match bg-surface but not bg-surface1, bg-surface2, or bg-surface-strong (if valid)
  // bg-surface is legacy. bg-surface1 is new.
  /\bbg-surface\b(?![-12])/, 
  /\bbg-surface-strong\b/, 
  /\bbg-surface-muted\b/, 
  /\btext-foreground\b/,
  // Match text-muted but not text-text-muted
  /(?<!text-)text-muted\b/,
  /\bbg-destructive\b/,
  /\btext-destructive\b/
];

const ROOT_DIR = path.resolve(__dirname, '../../apps/web');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '.vite'].includes(file)) {
        arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
      }
    } else {
      if (['.tsx', '.ts', '.css'].some(ext => file.endsWith(ext))) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });
  return arrayOfFiles;
}

const files = getAllFiles(ROOT_DIR);
let hasError = false;

console.log('Checking for legacy token usage...');

files.forEach(file => {
  // Skip this script itself and allowlists
  if (file.includes('tooling/governance')) return;
  // Skip legacy tokens file if it somehow still exists (it shouldn't)
  if (file.includes('shared/styles/tokens.css')) return;
  // Skip the new tokens definition file
  if (file.includes('theme/tokens.css')) return;
  
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    for (const pattern of LEGACY_PATTERNS) {
      if (pattern.test(line)) {
        console.error(`ERROR: Legacy token found in ${path.relative(ROOT_DIR, file)}:${index + 1}`);
        console.error(`       ${line.trim()}`);
        hasError = true;
      }
    }
  });
});

if (hasError) {
  console.error('\nFAILURE: Legacy tokens found. Please migrate to new tokens (bg-bg, bg-surface1, text-text, etc.).');
  process.exit(1);
} else {
  console.log('SUCCESS: No legacy tokens found.');
}