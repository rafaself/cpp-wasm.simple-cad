import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(scriptDir, '..');
const sourceDir = resolve(exampleDir, '../../dist/wasm');
const targetDir = resolve(exampleDir, 'public/wasm');

const requiredFiles = ['engine.js', 'engine.wasm'];

for (const file of requiredFiles) {
  const sourcePath = resolve(sourceDir, file);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Missing ${file} in ${sourceDir}. Build WASM first: bash engine-extracted/scripts/build_wasm.sh`,
    );
  }
}

mkdirSync(targetDir, { recursive: true });

for (const file of requiredFiles) {
  const sourcePath = resolve(sourceDir, file);
  const targetPath = resolve(targetDir, file);
  copyFileSync(sourcePath, targetPath);
  console.log(`synced ${file}`);
}
