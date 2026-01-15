#!/usr/bin/env node
/**
 * Drift gate for the Engine API manifest.
 * Fails CI when bindings change without regenerating docs/api/engine_api_manifest.json + ENGINE_API_MANIFEST.md.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const projectRoot = path.resolve(__dirname, "../..");
const manifestJsonPath = path.join(projectRoot, "docs", "api", "engine_api_manifest.json");
const manifestMdPath = path.join(projectRoot, "docs", "api", "ENGINE_API_MANIFEST.md");

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

function findBindingFiles() {
  const candidates = walk(path.join(projectRoot, "cpp"));
  return candidates.filter((file) => /bindings.*\.cpp$/.test(path.basename(file)));
}

function computeSourceHash(files) {
  const hash = crypto.createHash("sha256");
  const sorted = [...files].sort();
  for (const file of sorted) {
    hash.update(normalize(path.relative(projectRoot, file)));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

function main() {
  if (!fs.existsSync(manifestJsonPath) || !fs.existsSync(manifestMdPath)) {
    console.error("Manifest files are missing. Run scripts/generate_engine_api_manifest.js.");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestJsonPath, "utf8"));
  const bindingFiles = findBindingFiles();
  if (!bindingFiles.length) {
    console.error("No bindings files found (expected cpp/**/bindings*.cpp).");
    process.exit(1);
  }

  const currentHash = computeSourceHash(bindingFiles);

  if (!manifest.sourceHash) {
    console.error("Manifest is missing sourceHash. Regenerate via scripts/generate_engine_api_manifest.js.");
    process.exit(1);
  }

  if (manifest.sourceHash !== currentHash) {
    console.error("Engine bindings changed without regenerating the manifest.");
    console.error(`Current hash:   ${currentHash}`);
    console.error(`Manifest hash:  ${manifest.sourceHash}`);
    process.exit(1);
  }

  const mdContent = fs.readFileSync(manifestMdPath, "utf8");
  if (!mdContent.includes(manifest.sourceHash)) {
    console.error("Markdown manifest is out of sync with JSON (hash mismatch). Regenerate manifests.");
    process.exit(1);
  }

  console.log("✅ Engine API manifest is up to date.");
  console.log(`Bindings hashed from: ${bindingFiles.map((f) => normalize(path.relative(projectRoot, f))).join(", ")}`);
}

main();
