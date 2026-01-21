#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const MAGIC_ESNP = 0x504e5345; // "ESNP"
const HEADER_BYTES = 16;

const IGNORE_DIRS = new Set(['.git', 'node_modules', '.pnpm', 'dist', 'build', 'out', '.turbo']);

function readU32LE(buf, offset) {
  return buf.readUInt32LE(offset);
}

function normalizePattern(pattern) {
  return pattern.replace(/\\/g, '/').replace(/^\.\//, '');
}

function hasWildcard(pattern) {
  return /[*?]/.test(pattern);
}

function globToRegex(pattern) {
  let out = '^';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 3;
          continue;
        }
        out += '.*';
        i += 2;
        continue;
      }
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    if ('\\.[]{}()+-^$|'.includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
    i += 1;
  }
  out += '$';
  return new RegExp(out);
}

function walkFiles(root, out) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkFiles(fullPath, out);
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
}

function collectFiles(patterns) {
  const results = new Set();
  const missingExplicit = [];
  const normalized = patterns.map(normalizePattern);
  const explicit = normalized.filter((pattern) => !hasWildcard(pattern));
  const wildcard = normalized.filter(hasWildcard);

  for (const pattern of explicit) {
    const abs = path.isAbsolute(pattern) ? pattern : path.join(repoRoot, pattern);
    if (!fs.existsSync(abs)) {
      missingExplicit.push(pattern);
      continue;
    }
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      results.add(abs);
    }
  }

  if (wildcard.length > 0) {
    const files = [];
    walkFiles(repoRoot, files);
    const regexes = wildcard.map((pattern) => globToRegex(pattern));
    for (const file of files) {
      const rel = normalizePattern(path.relative(repoRoot, file));
      for (const regex of regexes) {
        if (regex.test(rel)) {
          results.add(file);
          break;
        }
      }
    }
  }

  if (missingExplicit.length > 0) {
    throw new Error(`Missing explicit paths: ${missingExplicit.join(', ')}`);
  }

  return [...results];
}

function main() {
  const args = process.argv.slice(2);
  const patterns = args.length > 0 ? args : ['**/*.esnp'];
  let failures = 0;

  let files = [];
  try {
    files = collectFiles(patterns);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('No ESNP fixtures found.');
    return;
  }

  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const buf = fs.readFileSync(file);
    if (buf.length < HEADER_BYTES) {
      console.error(`Invalid ESNP snapshot (too small): ${rel}`);
      failures += 1;
      continue;
    }
    const magic = readU32LE(buf, 0);
    if (magic !== MAGIC_ESNP) {
      console.error(`Invalid ESNP magic: ${rel}`);
      failures += 1;
      continue;
    }
    const version = readU32LE(buf, 4);
    if (version < 4) {
      console.error(`Outdated ESNP version ${version}: ${rel}`);
      failures += 1;
    }
  }

  if (failures > 0) {
    process.exit(1);
  }

  console.log('ESNP fixture version check passed.');
}

main();
