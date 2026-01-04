#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const allowlistGlobs = [
  // Canonical token sources
  'design/**',
  'shared/styles/tokens.css',
  'public/**',
  'assets/**',
  'tailwind.config.cjs',
  'index.html',
  'scripts/**',
  'theme/**',
];

// Temporary debt allowlist: legacy hex usage that must be migrated to tokens.
const fileAllowlist = new Set([
  'components/ColorPicker/ColorInputs.tsx',
  'components/ColorPicker/Swatches.tsx',
  'components/ColorPicker/index.tsx',
  'components/dev/PerformanceMonitor.tsx',
  'components/ColorPicker/ColorSlider.tsx',
  'components/TextCaretOverlay.tsx',
  'features/editor/components/Header.tsx',
  'features/editor/components/MarqueeOverlay.tsx',
  'features/editor/components/SelectionOverlay.tsx',
  'features/editor/components/ribbon/RibbonButton.tsx',
  'features/editor/interactions/handlers/DraftingHandler.tsx',
  'features/import/utils/dxf/aciColors.ts',
  'features/import/utils/dxf/colorScheme.ts',
  'features/import/utils/dxf/dxfColorScheme.test.ts',
  'features/import/utils/dxf/dxfFidelity.test.ts',
  'features/import/utils/dxf/dxfSvgToVectorSidecar.test.ts',
  'features/import/utils/dxf/dxfToShapes.test.ts',
  'features/import/utils/dxf/dxfToSvg.test.ts',
  'features/import/utils/dxf/dxfToSvg.ts',
  'features/import/utils/dxf/dxfWorker.ts',
  'features/import/utils/dxf/styles.ts',
  'features/import/utils/pdfBorderFilter.test.ts',
  'features/import/utils/pdfMatrixUtils.ts',
  'features/import/utils/pdfShapesToSvg.test.ts',
  'features/import/utils/pdfShapesToSvg.ts',
  'features/import/utils/pdfToShapes.ts',
  'features/import/utils/pdfToShapes.test.ts',
  'features/import/utils/pdfToVectorDocument.test.ts',
  'features/import/utils/pdfToVectorDocument.ts',
  'features/import/utils/svg/svgToVectorDocument.test.ts',
  'stores/useSettingsStore.ts',
  'test-utils/interactionHarness.ts',
  'tests/interactionSessionCommit.test.ts',
  'tests/shapeColors.test.ts',
  'tests/vectorSidecarMerge.test.ts',
  'utils/dev/performanceAPI.ts',
  'utils/cssColor.ts',
  'utils/color.ts',
  'engine/renderer/TessellatedWasmLayer.test.tsx',
  'features/editor/components/ShapeOverlay.tsx',
]);

const ignoreDirs = new Set(['node_modules', 'dist', 'coverage', 'build', '.git', '.next']);
const hexRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-fA-F])/g;

const globToRegExp = (glob) => {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Preserve ** replacements so we don't mangle them when replacing single *
  const placeholder = '__DOUBLE_STAR__';
  const withPlaceholder = escaped.replace(/\*\*/g, placeholder);
  const singlesHandled = withPlaceholder.replace(/\*/g, '[^/]*');
  const pattern = singlesHandled.replace(new RegExp(placeholder, 'g'), '.*');
  return new RegExp(`^${pattern}$`);
};

const allowlistPatterns = allowlistGlobs.map(globToRegExp);

const isAllowed = (relPath) => allowlistPatterns.some((re) => re.test(relPath));

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
};

const shouldScan = (file) => {
  const ext = path.extname(file).toLowerCase();
  return ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.html', '.md', '.cjs', '.mjs'].includes(ext);
};

const files = walk(projectRoot).filter(shouldScan);
const violations = [];

for (const absPath of files) {
  const relPath = path.relative(projectRoot, absPath).replace(/\\/g, '/');
  if (fileAllowlist.has(relPath)) continue;
  if (isAllowed(relPath)) continue;
  const content = fs.readFileSync(absPath, 'utf8');
  if (!hexRegex.test(content)) continue;
  violations.push(relPath);
}

console.log('=== Hex Color Governance ===');
if (violations.length > 0) {
  console.error('❌ Found hex colors outside allowed paths:');
  violations.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
} else {
  console.log('✅ No disallowed hex colors found.');
}
