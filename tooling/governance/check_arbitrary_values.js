const fs = require('fs');
const path = require('path');

const ARBITRARY_PATTERNS = [
  /\b(z|gap|p|px|py|m|mx|my|text|w|h)-\[/,
];

const ROOT_DIR = path.resolve(__dirname, '../../apps/web');
const ALLOWLIST_PATH = path.resolve(__dirname, 'allowlists/arbitrary_values_exceptions.json');

let allowlist = [];
try {
  const allowlistData = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  allowlist = allowlistData.files.map(f => path.resolve(__dirname, '../../', f));
} catch (e) {
  console.warn('Warning: Could not load allowlist or allowlist is empty.');
}

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'build') {
        arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
      }
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

const files = getAllFiles(ROOT_DIR);
let hasError = false;

console.log('Checking for arbitrary Tailwind values...');

files.forEach(file => {
  if (allowlist.includes(file)) {
    return;
  }

  const content = fs.readFileSync(file, 'utf8');
  const relativePath = path.relative(path.resolve(__dirname, '../../'), file);
  
  // Check lines
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    for (const pattern of ARBITRARY_PATTERNS) {
      if (pattern.test(line)) {
        console.error(`ERROR: Arbitrary value found in ${relativePath}:${index + 1}`);
        console.error(`       ${line.trim()}`);
        hasError = true;
      }
    }
  });
});

if (hasError) {
  console.error('\nFAILURE: Arbitrary Tailwind values found in non-allowlisted files.');
  console.error('See DESIGN.md §3.2 for allowed patterns.');
  process.exit(1);
} else {
  console.log('SUCCESS: No arbitrary Tailwind values found (outside allowlist).');
}
