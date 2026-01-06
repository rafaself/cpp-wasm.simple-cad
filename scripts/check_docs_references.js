#!/usr/bin/env node

/**
 * Doc drift checker.
 *
 * Verifies that referenced file paths in key docs exist.
 * Scope: AGENTS.md and docs/ENGINE_FIRST_GOVERNANCE.md
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const targets = [
  path.join(repoRoot, 'AGENTS.md'),
  path.join(repoRoot, 'docs', 'ENGINE_FIRST_GOVERNANCE.md'),
];

function collectCandidates(content) {
  const candidates = new Set();

  // Inline code paths `foo/bar.ext`
  const codeRegex = /`([^`]+)`/g;
  let match;
  while ((match = codeRegex.exec(content))) {
    candidates.add(match[1]);
  }

  // Markdown links [text](path)
  const linkRegex = /\[[^\]]*?\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(content))) {
    candidates.add(match[1]);
  }

  return [...candidates];
}

function normalizeCandidate(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Skip urls and anchors
  if (/^(https?:)?\/\//i.test(trimmed)) return null;
  if (trimmed.startsWith('#')) return null;
  if (trimmed.includes(' ')) return null;
  // Remove anchors
  const withoutAnchor = trimmed.split('#')[0];
  // Skip globs and wildcards
  if (withoutAnchor.includes('*')) return null;
  if (!withoutAnchor.includes('/')) return null;
  // Only consider paths that look like files (have an extension) or explicit directories
  const hasExt = /\.[a-zA-Z0-9]+$/.test(withoutAnchor);
  const endsWithSlash = withoutAnchor.endsWith('/');
  if (!hasExt && !endsWithSlash) return null;
  return withoutAnchor.replace(/^\.\//, '');
}

const missing = [];

for (const target of targets) {
  const content = fs.readFileSync(target, 'utf-8');
  const candidates = collectCandidates(content);
  for (const cand of candidates) {
    const normalized = normalizeCandidate(cand);
    if (!normalized) continue;
    const resolved = path.join(repoRoot, normalized);
    if (!fs.existsSync(resolved)) {
      missing.push({ source: path.relative(repoRoot, target), path: normalized });
    }
  }
}

if (missing.length > 0) {
  console.error('Doc drift detected. Missing referenced paths:');
  for (const m of missing) {
    console.error(`- ${m.source}: \`${m.path}\` not found`);
  }
  process.exit(1);
}

console.log('Doc reference check passed.');
