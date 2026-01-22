#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");
const ignoreDirs = new Set([
  ".git",
  ".vscode",
  ".idea",
  "node_modules",
  "dist",
  "coverage",
  "build",
  "build_native",
  "build_test"
]);

const SECRET_REGEX = /(PASSWORD|API_KEY|SECRET|TOKEN|SUDO_PASSWORD)\s*(?:=|:)/i;
const FAIL_ON_SECRET = process.env.FAIL_ON_SECRET === "1";

const normalize = (p) => p.replace(/\\/g, "/");

function loadAllowlist() {
  const allowlistPath = path.join(__dirname, "allowlists", "secrets_allowlist.json");
  try {
    const raw = fs.readFileSync(allowlistPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      files: Array.isArray(parsed.files) ? parsed.files : [],
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : []
    };
  } catch (err) {
    if (err.code === "ENOENT") {
      return { files: [], patterns: [] };
    }
    console.error(`Error reading allowlist: ${err.message}`);
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

function isBinaryContent(content) {
  return content.includes("\u0000");
}

function matchSecret(line) {
  const result = SECRET_REGEX.exec(line);
  if (!result) return null;
  return result[1].toUpperCase();
}

function main() {
  const allowlist = loadAllowlist();
  const fileAllowset = new Map(
    allowlist.files.map((entry) => [normalize(entry.path), entry.reason || "allowlisted"])
  );

  const files = walk(projectRoot);
  const violations = [];
  const skipped = [];

  for (const file of files) {
    const rel = normalize(path.relative(projectRoot, file));
    if (rel.startsWith(".git/")) continue;
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch (err) {
      console.warn(`Warning: Unable to read ${rel}: ${err.message}`);
      continue;
    }

    if (isBinaryContent(content)) continue;

    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx];
      const keyword = matchSecret(line);
      if (!keyword) continue;

      if (fileAllowset.has(rel)) {
        skipped.push({ file: rel, line: idx + 1, reason: fileAllowset.get(rel) });
        continue;
      }

      const patternEntry = allowlist.patterns.find((entry) => {
        if (!entry.pattern) return false;
        try {
          const matcher = new RegExp(entry.pattern, "i");
          return matcher.test(line);
        } catch {
          return line.includes(entry.pattern);
        }
      });

      if (patternEntry) {
        skipped.push({ file: rel, line: idx + 1, reason: patternEntry.reason || "pattern allowlist" });
        continue;
      }

      violations.push({ file: rel, line: idx + 1, keyword, snippet: line.trim() });
    }
  }

  if (!violations.length) {
    console.log("Secrets scan: no matches detected.");
  } else {
    console.log("Secrets scan: potential secrets detected (set FAIL_ON_SECRET=1 to fail CI)");
    violations.forEach((violation) => {
      console.log(`  ${violation.file}:${violation.line} [${violation.keyword}] ${violation.snippet}`);
    });
  }

  if (skipped.length) {
    console.log("Secrets scan: matches skipped because they are allowlisted:");
    skipped.forEach((skip) => {
      console.log(`  ${skip.file}:${skip.line} (${skip.reason})`);
    });
  }

  if (violations.length && FAIL_ON_SECRET) {
    console.error("FAIL_ON_SECRET=1 and matches found -> failing.");
    process.exit(1);
  }
}

main();
