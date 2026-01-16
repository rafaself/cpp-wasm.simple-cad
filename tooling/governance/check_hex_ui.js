const fs = require('fs');
const path = require('path');

const HEX_UI_PATTERNS = [
  /className="[^"]*#[0-9a-fA-F]{3,8}/,
  /className=\{[^}]*`[^`]*#[0-9a-fA-F]{3,8}/,
  /style=\{\{[^}]*(background|border|color|backgroundColor):[^}]*#[0-9a-fA-F]{3,8}/
];

const DATA_HEX_PATTERNS = [
  /data-[a-z-]+="#[0-9a-fA-F]{3,8}"/,
  /const\s+\w+\s*=\s*['"]#[0-9a-fA-F]{3,8}/
];

const ROOT_DIR = path.resolve(__dirname, '../../apps/web');
const ALLOWLIST_PATH = path.resolve(__dirname, 'allowlists/hex_data.json');

let allowlist = [];
try {
  const allowlistData = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  allowlist = allowlistData.files.map(f => path.resolve(__dirname, '../../', f.replace(/\*\*/g, '')));
} catch (e) {
  // If it fails, we use a basic allowlist
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
      if (['.tsx', '.ts', '.js', '.jsx'].some(ext => file.endsWith(ext))) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });
  return arrayOfFiles;
}

const files = getAllFiles(ROOT_DIR);
let hasError = false;

console.log('Checking for hex colors in UI styles (className/style)...');

files.forEach(file => {
  const relPath = path.relative(path.resolve(__dirname, '../../'), file);
  // Simple prefix match for allowlist
  if (allowlist.some(allowed => file.startsWith(allowed))) {
    return;
  }

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    let violation = false;
    for (const pattern of HEX_UI_PATTERNS) {
      if (pattern.test(line)) {
        // Double check it's not a data pattern on the same line
        if (!DATA_HEX_PATTERNS.some(p => p.test(line))) {
          violation = true;
          break;
        }
      }
    }

    if (violation) {
      console.error(`ERROR: Hex color found in UI style at ${relPath}:${index + 1}`);
      console.error(`       ${line.trim()}`);
      hasError = true;
    }
  });
});

if (hasError) {
  console.error('\nFAILURE: Hex colors found in UI context. Use semantic tokens instead.');
  process.exit(1);
} else {
  console.log('SUCCESS: No hex colors found in UI contexts (outside allowlist).');
}
