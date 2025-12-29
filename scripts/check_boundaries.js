#!/usr/bin/env node
/**
 * Boundary enforcement for Engine-First architecture.
 * - Blocks new runtime.engine usage outside frontend/engine/**
 * - Blocks new direct engine imports from frontend/features/**
 * Uses scripts/boundary_rules.json for allowlists and entrypoints.
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const boundaryConfigPath = path.join(projectRoot, "scripts", "boundary_rules.json");

const ignoreDirs = new Set([
  ".git",
  ".vscode",
  ".idea",
  "node_modules",
  "dist",
  "coverage",
  "build",
  "build_native"
]);

const normalize = (p) => p.replace(/\\/g, "/");

function loadConfig() {
  try {
    const raw = fs.readFileSync(boundaryConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      runtimeEngineAllowlist: parsed.runtimeEngineAllowlist || [],
      featureImportEntrypoints: parsed.featureImportEntrypoints || [],
      featureImportAllowlist: parsed.featureImportAllowlist || []
    };
  } catch (err) {
    console.error(`Failed to load boundary rules from ${boundaryConfigPath}: ${err.message}`);
    process.exit(1);
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }

  return files;
}

function normalizeImportPath(importPath, fromFile) {
  if (importPath.startsWith("@/")) {
    return normalize(path.join("frontend", importPath.slice(2)));
  }
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const resolved = path.resolve(path.dirname(fromFile), importPath);
    const rel = normalize(path.relative(projectRoot, resolved));
    return rel.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
  }
  return normalize(importPath);
}

function listTsFiles() {
  return walk(projectRoot).filter((file) => {
    const rel = normalize(path.relative(projectRoot, file));
    return /\.(ts|tsx)$/.test(rel);
  });
}

function checkRuntimeEngineUsage(tsFiles, runtimeAllowlist) {
  const allowMap = new Map(runtimeAllowlist.map((e) => [normalize(e.path), e]));
  const allowUsed = new Set();
  const violations = [];

  for (const file of tsFiles) {
    const rel = normalize(path.relative(projectRoot, file));
    if (rel.startsWith("frontend/engine/")) continue;

    const content = fs.readFileSync(file, "utf8").split(/\r?\n/);
    content.forEach((line, idx) => {
      if (!line.includes("runtime.engine")) return;
      if (line.trimStart().startsWith("//")) return;

      if (allowMap.has(rel)) {
        allowUsed.add(rel);
        return;
      }

      violations.push({
        file: rel,
        line: idx + 1,
        snippet: line.trim()
      });
    });
  }

  return { violations, unusedAllows: [...allowMap.keys()].filter((p) => !allowUsed.has(p)) };
}

function checkFeatureImports(tsFiles, config) {
  const entrypoints = new Set(config.featureImportEntrypoints.map(normalize));
  const allowKey = (pathValue, importPath) => `${pathValue}::${importPath}`;
  const allowMap = new Map(
    (config.featureImportAllowlist || []).map((e) => [
      allowKey(normalize(e.path), normalize(e.import)),
      e
    ])
  );
  const allowUsed = new Set();
  const violations = [];

  for (const file of tsFiles) {
    const rel = normalize(path.relative(projectRoot, file));
    if (!rel.startsWith("frontend/features/")) continue;

    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("import")) return;
      if (trimmed.startsWith("//")) return;

      const match = trimmed.match(/import[^;]*from\s+["']([^"']+)["']/);
      if (!match) return;

      const importPath = normalizeImportPath(match[1], file);
      if (!importPath.startsWith("frontend/engine/")) return;

      if (entrypoints.has(importPath)) return;

      const key = allowKey(rel, importPath);
      if (allowMap.has(key)) {
        allowUsed.add(key);
        return;
      }

      violations.push({
        file: rel,
        line: idx + 1,
        importPath
      });
    });
  }

  const unusedAllows = [...allowMap.keys()].filter((k) => !allowUsed.has(k));
  return { violations, unusedAllows };
}

function main() {
  const config = loadConfig();
  const tsFiles = listTsFiles();

  const runtimeResult = checkRuntimeEngineUsage(tsFiles, config.runtimeEngineAllowlist);
  const featureResult = checkFeatureImports(tsFiles, config);

  const errors = [...runtimeResult.violations, ...featureResult.violations];

  console.log("=== Boundary Check ===");
  if (runtimeResult.violations.length) {
    console.log("Runtime engine access outside frontend/engine/ detected:");
    runtimeResult.violations.forEach((v) => {
      console.log(`  ❌ ${v.file}:${v.line} -> ${v.snippet}`);
    });
    console.log("");
  }

  if (featureResult.violations.length) {
    console.log("Direct engine imports from frontend/features/ detected:");
    featureResult.violations.forEach((v) => {
      console.log(`  ❌ ${v.file}:${v.line} imports ${v.importPath}`);
    });
    console.log("");
  }

  if (runtimeResult.unusedAllows.length) {
    console.log("Info: unused runtime allowlist entries:");
    runtimeResult.unusedAllows.forEach((p) => console.log(`  • ${p}`));
    console.log("");
  }

  if (featureResult.unusedAllows.length) {
    console.log("Info: unused feature import allowlist entries:");
    featureResult.unusedAllows.forEach((k) => console.log(`  • ${k}`));
    console.log("");
  }

  if (!errors.length) {
    console.log("✅ Boundary checks passed.");
  } else {
    process.exit(1);
  }
}

main();
