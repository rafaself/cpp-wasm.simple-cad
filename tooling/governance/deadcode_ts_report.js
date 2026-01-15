#!/usr/bin/env node

/**
 * Generate a TypeScript dead-code report.
 *
 * Signals gathered:
 * - TSC unused diagnostics (noEmit + noUnusedLocals/Parameters)
 * - Alias-based orphan scan (files with no imports from other TS/TSX files)
 * - depcheck (if available)
 *
 * Output: reports/deadcode_ts.md
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const frontendRoot = path.join(repoRoot, 'apps/web');
const reportsDir = path.join(repoRoot, 'reports');
const reportPath = path.join(reportsDir, 'deadcode_ts.md');

fs.mkdirSync(reportsDir, { recursive: true });

function run(cmd, options = {}) {
  const result = spawnSync(cmd, {
    shell: true,
    cwd: repoRoot,
    encoding: 'utf-8',
    ...options,
  });
  return {
    cmd,
    code: typeof result.status === 'number' ? result.status : 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function formatCommandResult(result) {
  const chunks = [
    `Command: \`${result.cmd}\``,
    `Exit code: ${result.code}`,
  ];
  if (result.stdout.trim()) {
    chunks.push('stdout:', '```', result.stdout.trim(), '```');
  }
  if (result.stderr.trim()) {
    chunks.push('stderr:', '```', result.stderr.trim(), '```');
  }
  return chunks.join('\n');
}

function collectTsFiles() {
  const files = [];
  const ignoreDirs = new Set([
    'node_modules',
    'dist',
    'coverage',
    'build',
    'build_output.log',
    '.git',
    'reports',
  ]);

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (['.ts', '.tsx', '.mts', '.cts'].includes(ext)) {
          files.push(path.join(dir, entry.name));
        }
      }
    }
  }

  walk(frontendRoot);
  return files;
}

function findAliasOrphans(tsFiles, fileContents) {
  const candidates = [];
  const lookup = new Map(tsFiles.map((f, idx) => [f, idx]));

  for (let i = 0; i < tsFiles.length; i++) {
    const file = tsFiles[i];
    const rel = path
      .relative(frontendRoot, file)
      .split(path.sep)
      .join('/');
    const moduleId = '@/' + rel.replace(/\.(ts|tsx|mts|cts)$/i, '');
    const content = fileContents[i];

    // Ignore files with no exports — likely entrypoints or test data.
    if (!/export\s+(?:const|function|class|type|interface|default)/.test(content)) {
      continue;
    }

    let used = false;
    for (let j = 0; j < fileContents.length; j++) {
      if (i === j) continue;
      if (fileContents[j].includes(moduleId)) {
        used = true;
        break;
      }
    }

    if (!used) {
      candidates.push({ relPath: rel, moduleId });
    }
  }

  // Deduplicate by moduleId/path.
  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = `${c.relPath}:${c.moduleId}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  return unique.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

// Run commands
const tscUnused = run('cd apps/web && pnpm tsc --noEmit --noUnusedLocals --noUnusedParameters --pretty false --skipLibCheck');

let depcheckResult;
const depcheckBin = path.join(frontendRoot, 'node_modules', '.bin', 'depcheck');
if (fs.existsSync(depcheckBin)) {
  depcheckResult = run('cd apps/web && pnpm depcheck');
}

const tsFiles = collectTsFiles();
const fileContents = tsFiles.map((file) => {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
});
const aliasOrphans = findAliasOrphans(tsFiles, fileContents);

// Build report
const lines = [];
lines.push('# TypeScript Dead Code Report');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push('## TSC unused diagnostics');
lines.push(formatCommandResult(tscUnused));
lines.push('');
lines.push('## Alias orphan scan (TS/TSX)');
if (aliasOrphans.length === 0) {
  lines.push('No orphaned modules detected via alias scan.');
} else {
  lines.push('Modules exported but not imported from other TS/TSX files (alias `@/` scan):');
  for (const c of aliasOrphans) {
    lines.push(`- \`${c.relPath}\` (module id: \`${c.moduleId}\`)`);
  }
}
lines.push('');
lines.push('## depcheck');
if (!depcheckResult) {
  lines.push('depcheck not installed; skipping (add to devDependencies to enable).');
} else {
  lines.push(formatCommandResult(depcheckResult));
}

fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8');
console.log(`TypeScript dead code report written to ${path.relative(repoRoot, reportPath)}`);
// Always exit 0; the report itself carries diagnostics.
process.exit(0);
