#!/usr/bin/env node
/**
 * Generates machine- and human-readable manifests of Embind exports.
 * - Scans cpp bindings*.cpp files for exports
 * - Infers subsystem owner (best effort)
 * - Finds TypeScript call sites (runtime.engine.* or enum usage)
 * - Emits docs/engine_api_manifest.json and docs/ENGINE_API_MANIFEST.md
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const projectRoot = path.resolve(__dirname, "..");
const docsDir = path.join(projectRoot, "docs");
const manifestJsonPath = path.join(docsDir, "engine_api_manifest.json");
const manifestMdPath = path.join(docsDir, "ENGINE_API_MANIFEST.md");

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

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferOwner(name) {
  const lower = name.toLowerCase();
  if (lower.includes("text")) return "text";
  if (lower.includes("layer")) return "layers";
  if (lower.includes("selection")) return "selection";
  if (lower.includes("transform") || lower.includes("marquee") || lower.includes("pick")) return "interaction";
  if (lower.includes("snap")) return "snap";
  if (lower.includes("render") || lower.includes("buffer") || lower.includes("atlas")) return "render";
  if (lower.includes("history")) return "history";
  if (lower.includes("event")) return "events";
  return "core";
}

function parseExports(bindingPath) {
  const rel = normalize(path.relative(projectRoot, bindingPath));
  const lines = fs.readFileSync(bindingPath, "utf8").split(/\r?\n/);
  const exports = [];

  const patterns = [
    { kind: "class", regex: /emscripten::class_<[^>]+>\("([^"]+)"\)/ },
    { kind: "enum", regex: /emscripten::enum_<[^>]+>\("([^"]+)"\)/ },
    { kind: "value_object", regex: /emscripten::value_object<[^>]+>\("([^"]+)"\)/ },
    { kind: "vector", regex: /emscripten::register_vector<[^>]+>\("([^"]+)"\)/ },
    { kind: "function", regex: /\.function\("([^"]+)"/ }
  ];

  lines.forEach((line, idx) => {
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        exports.push({
          name: match[1],
          kind: pattern.kind,
          source: { file: rel, line: idx + 1 }
        });
      }
    }
  });

  return exports;
}

function listTsFiles() {
  return walk(path.join(projectRoot, "frontend")).filter((file) => /\.(ts|tsx)$/.test(file));
}

function findCallSites(exports) {
  const tsFiles = listTsFiles();
  const refs = new Map();
  const names = exports.map((e) => e.name);

  // Pre-build regex per export to avoid recreating inside the loop
  const regexByName = new Map();
  for (const exp of exports) {
    if (exp.kind === "function") {
      regexByName.set(exp.name, new RegExp(`runtime\\.engine\\.?\\??\\.${escapeRegExp(exp.name)}\\b`));
    } else {
      regexByName.set(exp.name, new RegExp(`\\b${escapeRegExp(exp.name)}\\b`));
    }
  }

  for (const file of tsFiles) {
    const rel = normalize(path.relative(projectRoot, file));
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

    lines.forEach((line, idx) => {
      for (const name of names) {
        const regex = regexByName.get(name);
        if (!regex) continue;
        if (!regex.test(line)) continue;
        const key = name;
        const entry = { file: rel, line: idx + 1 };
        if (!refs.has(key)) refs.set(key, []);
        // Avoid duplicates for identical file+line
        const existing = refs.get(key);
        const already = existing.some((r) => r.file === entry.file && r.line === entry.line);
        if (!already) {
          existing.push(entry);
        }
      }
    });
  }

  // Sort references for determinism
  for (const [name, entries] of refs.entries()) {
    entries.sort((a, b) => {
      if (a.file === b.file) return a.line - b.line;
      return a.file < b.file ? -1 : 1;
    });
    refs.set(name, entries);
  }

  return refs;
}

function buildManifest(bindingExports, bindingFiles, sourceHash) {
  const exportMap = new Map();
  // Prefer the first occurrence for source locations (sorted later)
  for (const exp of bindingExports) {
    if (!exportMap.has(exp.name)) {
      exportMap.set(exp.name, {
        name: exp.name,
        kind: exp.kind,
        owner: inferOwner(exp.name),
        source: exp.source,
        references: []
      });
    }
  }

  const refs = findCallSites([...exportMap.values()]);
  for (const [name, calls] of refs.entries()) {
    const entry = exportMap.get(name);
    if (entry) {
      entry.references = calls;
    }
  }

  const sortedExports = [...exportMap.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    sourceHash,
    generatedAt: new Date().toISOString(),
    bindings: bindingFiles.map((f) => normalize(path.relative(projectRoot, f))).sort(),
    exports: sortedExports
  };
}

function renderMarkdown(manifest) {
  const lines = [];
  lines.push("# Engine API Manifest");
  lines.push("");
  lines.push(`Source hash: \`${manifest.sourceHash}\``);
  lines.push(`Generated at: ${manifest.generatedAt}`);
  lines.push("");
  lines.push("Bindings:");
  manifest.bindings.forEach((b) => lines.push(`- ${b}`));
  lines.push("");
  lines.push("| Name | Kind | Owner | Source | TS call sites |");
  lines.push("| --- | --- | --- | --- | --- |");

  for (const exp of manifest.exports) {
    const source = `${exp.source.file}:${exp.source.line}`;
    const callSites = exp.references && exp.references.length
      ? `${exp.references.length} × ${exp.references.slice(0, 3).map((r) => `${r.file}:${r.line}`).join(", ")}`
      : "—";
    lines.push(`| ${exp.name} | ${exp.kind} | ${exp.owner} | ${source} | ${callSites} |`);
  }

  return lines.join("\n");
}

function main() {
  const bindingFiles = findBindingFiles();
  if (!bindingFiles.length) {
    console.error("No bindings files found (expected cpp/**/bindings*.cpp).");
    process.exit(1);
  }

  const bindingExports = bindingFiles.flatMap(parseExports);
  const sourceHash = computeSourceHash(bindingFiles);
  const manifest = buildManifest(bindingExports, bindingFiles, sourceHash);
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestMd = renderMarkdown(manifest);

  fs.writeFileSync(manifestJsonPath, manifestJson);
  fs.writeFileSync(manifestMdPath, manifestMd);

  console.log(`Generated manifest for ${manifest.exports.length} exports.`);
  console.log(`JSON: ${normalize(path.relative(projectRoot, manifestJsonPath))}`);
  console.log(`Markdown: ${normalize(path.relative(projectRoot, manifestMdPath))}`);
  console.log(`Source hash: ${manifest.sourceHash}`);
}

main();
