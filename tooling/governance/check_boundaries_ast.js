#!/usr/bin/env node
/**
 * AST-based boundary enforcement for Engine-First architecture.
 * Replaces regex-based check_boundaries.js with proper TypeScript AST parsing.
 *
 * - Blocks new runtime.engine usage outside apps/web/engine/**
 * - Blocks new direct engine imports from apps/web/features/**
 * - Detects multiline imports, aliased paths, and re-exports
 *
 * Uses tooling/governance/boundary_rules.json for allowlists and entrypoints.
 */

const fs = require("fs");
const path = require("path");

// Try to load TypeScript from apps/web/node_modules
let ts;
try {
  ts = require("typescript");
} catch (e) {
  try {
    ts = require("../../apps/web/node_modules/typescript");
  } catch (e2) {
    console.error("Error: TypeScript not found. Please install typescript in apps/web:");
    console.error("  cd apps/web && npm install");
    process.exit(1);
  }
}

const projectRoot = path.resolve(__dirname, "../..");
const boundaryConfigPath = path.join(projectRoot, "tooling", "governance", "boundary_rules.json");

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
    return normalize(path.join("apps/web", importPath.slice(2)));
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

/**
 * Extract all import declarations from a TypeScript file using AST
 */
function extractImports(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true // setParentNodes
  );

  const imports = [];

  function visit(node) {
    // Handle: import ... from 'module'
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        imports.push({
          type: 'import',
          path: moduleSpecifier.text,
          line
        });
      }
    }

    // Handle: export ... from 'module'
    if (ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        imports.push({
          type: 'export',
          path: moduleSpecifier.text,
          line
        });
      }
    }

    // Handle: import('module') - dynamic imports
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          imports.push({
            type: 'dynamic',
            path: arg.text,
            line
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

/**
 * Find all runtime.engine usage using AST property access detection
 */
function findRuntimeEngineUsage(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const usages = [];

  function visit(node) {
    // Match: runtime.engine or runtime?.engine
    if (ts.isPropertyAccessExpression(node)) {
      const obj = node.expression;
      const prop = node.name;

      // Direct: runtime.engine
      if (ts.isIdentifier(obj) && obj.text === 'runtime' &&
          ts.isIdentifier(prop) && prop.text === 'engine') {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const snippet = content.split('\n')[line - 1]?.trim() || '';
        usages.push({ line, snippet });
      }

      // Chained: something.runtime.engine
      if (ts.isPropertyAccessExpression(obj) &&
          ts.isIdentifier(obj.name) && obj.name.text === 'runtime' &&
          ts.isIdentifier(prop) && prop.text === 'engine') {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const snippet = content.split('\n')[line - 1]?.trim() || '';
        usages.push({ line, snippet });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return usages;
}

function checkRuntimeEngineUsage(tsFiles, runtimeAllowlist) {
  const allowMap = new Map(runtimeAllowlist.map((e) => [normalize(e.path), e]));
  const allowUsed = new Set();
  const violations = [];

  for (const file of tsFiles) {
    const rel = normalize(path.relative(projectRoot, file));
    if (rel.startsWith("apps/web/engine/")) continue;

    try {
      const usages = findRuntimeEngineUsage(file);

      for (const usage of usages) {
        if (allowMap.has(rel)) {
          allowUsed.add(rel);
          continue;
        }

        violations.push({
          file: rel,
          line: usage.line,
          snippet: usage.snippet
        });
      }
    } catch (err) {
      console.warn(`Warning: Failed to parse ${rel}: ${err.message}`);
    }
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
    if (!rel.startsWith("apps/web/features/")) continue;

    try {
      const imports = extractImports(file);

      for (const imp of imports) {
        const importPath = normalizeImportPath(imp.path, file);

        // Only check imports from apps/web/engine/
        if (!importPath.startsWith("apps/web/engine/")) continue;

        // Allow entrypoints
        if (entrypoints.has(importPath)) continue;

        // Check allowlist
        const key = allowKey(rel, importPath);
        if (allowMap.has(key)) {
          allowUsed.add(key);
          continue;
        }

        violations.push({
          file: rel,
          line: imp.line,
          importPath,
          type: imp.type
        });
      }
    } catch (err) {
      console.warn(`Warning: Failed to parse ${rel}: ${err.message}`);
    }
  }

  const unusedAllows = [...allowMap.keys()].filter((k) => !allowUsed.has(k));
  return { violations, unusedAllows };
}

function main() {
  const config = loadConfig();
  const tsFiles = listTsFiles();

  console.log(`Found ${tsFiles.length} TypeScript files to check...`);

  const runtimeResult = checkRuntimeEngineUsage(tsFiles, config.runtimeEngineAllowlist);
  const featureResult = checkFeatureImports(tsFiles, config);

  const errors = [...runtimeResult.violations, ...featureResult.violations];

  console.log("\n=== AST-Based Boundary Check ===");
  if (runtimeResult.violations.length) {
    console.log("Runtime engine access outside apps/web/engine/ detected:");
    runtimeResult.violations.forEach((v) => {
      console.log(`  ❌ ${v.file}:${v.line} -> ${v.snippet}`);
    });
    console.log("");
  }

  if (featureResult.violations.length) {
    console.log("Direct engine imports from apps/web/features/ detected:");
    featureResult.violations.forEach((v) => {
      const typeLabel = v.type === 'export' ? '(re-export)' : v.type === 'dynamic' ? '(dynamic)' : '';
      console.log(`  ❌ ${v.file}:${v.line} ${typeLabel} imports ${v.importPath}`);
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
    console.log("✅ All boundary checks passed.");
  } else {
    console.log(`\n❌ Found ${errors.length} boundary violation(s).`);
    process.exit(1);
  }
}

main();
