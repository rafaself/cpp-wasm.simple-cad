#!/usr/bin/env node
/**
 * File size governance with soft and hard caps.
 * - Soft cap: warning
 * - Hard cap: CI failure unless an explicit exception raises the limit
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");
const budgetPath = path.join(projectRoot, "tooling", "governance", "file_size_budget.json");
const exceptionsPath = path.join(projectRoot, "tooling", "governance", "file_size_budget_exceptions.json");

const ignoreDirs = new Set([
  ".git",
  ".vscode",
  ".idea",
  "node_modules",
  "dist",
  "coverage",
  "build",
  "build_native",
  "build_test", // CMake test build output
  "_deps"       // CMake fetched dependencies (freetype, googletest, etc.)
]);

const normalize = (p) => p.replace(/\\/g, "/");

function loadJson(filePath, label) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error(`Failed to load ${label} at ${filePath}:`, err.message);
    process.exit(1);
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  // Handle trailing newline consistently
  if (!content.length) return 0;
  return content.split(/\r?\n/).length;
}

function buildExceptionMap(raw) {
  const map = new Map();
  if (!raw || !Array.isArray(raw.files)) return map;
  for (const entry of raw.files) {
    if (!entry.path || !entry.reason) continue;
    map.set(normalize(entry.path), entry);
  }
  return map;
}

function main() {
  const budgets = loadJson(budgetPath, "budget configuration");
  const exceptionsRaw = loadJson(exceptionsPath, "budget exceptions");
  const exceptionMap = buildExceptionMap(exceptionsRaw);

  const files = walk(projectRoot);

  const errors = [];
  const softBreaches = [];
  const exceptionHits = [];

  for (const absPath of files) {
    const relPath = normalize(path.relative(projectRoot, absPath));
    const ext = path.extname(relPath).slice(1);
    if (!ext || !budgets[ext]) continue;

    const loc = countLines(absPath);
    const exception = exceptionMap.get(relPath);
    const softLimit = exception?.softLimit ?? budgets[ext].soft;
    const hardLimit = exception?.hardLimit ?? budgets[ext].hard;

    if (loc > hardLimit) {
      errors.push({ relPath, loc, hardLimit, exception });
    } else if (loc > softLimit) {
      softBreaches.push({ relPath, loc, softLimit, exception });
    } else if (exception) {
      exceptionHits.push({ relPath, loc, exception });
    }
  }

  console.log("=== File Size Budget Check ===");
  console.log(`Project root: ${projectRoot}`);
  console.log("");

  if (errors.length) {
    console.log("Hard cap violations:");
    for (const err of errors) {
      const reason = err.exception ? ` (exception present: ${err.exception.reason})` : "";
      console.log(`  ❌ ${err.relPath} — ${err.loc} LOC (hard cap ${err.hardLimit})${reason}`);
    }
    console.log("");
  }

  if (softBreaches.length) {
    console.log("Soft cap warnings:");
    for (const warn of softBreaches) {
      const reason = warn.exception ? ` (exception: ${warn.exception.reason})` : "";
      console.log(`  ⚠️  ${warn.relPath} — ${warn.loc} LOC (soft cap ${warn.softLimit})${reason}`);
    }
    console.log("");
  }

  if (exceptionHits.length) {
    console.log("Tracked exceptions in use:");
    for (const hit of exceptionHits) {
      const { reason, softLimit, hardLimit } = hit.exception;
      const limits = [softLimit ? `soft ${softLimit}` : null, hardLimit ? `hard ${hardLimit}` : null]
        .filter(Boolean)
        .join(", ");
      const limitText = limits ? ` (${limits})` : "";
      console.log(`  📋 ${hit.relPath} — ${hit.loc} LOC${limitText} :: ${reason}`);
    }
    console.log("");
  }

  if (!errors.length && !softBreaches.length) {
    console.log("✅ All files are within budget.");
  } else if (!errors.length) {
    console.log("⚠️  Soft cap warnings present (see above).");
  }

  if (errors.length) {
    process.exit(1);
  }
}

main();
