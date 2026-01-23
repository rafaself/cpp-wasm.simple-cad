#!/usr/bin/env node
/**
 * Unit tests for AST-based boundary checker
 * Verifies detection of multiline imports, dynamic imports, and re-exports
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const testDir = path.join(__dirname, ".test_boundary_fixtures");
const projectRoot = path.resolve(__dirname, "../..");

// Clean up test directory
function cleanup() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// Setup test directory
function setup() {
  cleanup();
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, "apps/web/features/test"), { recursive: true });
  fs.mkdirSync(path.join(testDir, "apps/web/engine/core"), { recursive: true });
}

// Create test boundary rules
function createTestConfig() {
  const config = {
    runtimeEngineAllowlist: [],
    featureImportEntrypoints: ["apps/web/engine/core/EngineRuntime"],
    featureImportAllowlist: []
  };
  fs.writeFileSync(
    path.join(testDir, "boundary_rules.json"),
    JSON.stringify(config, null, 2)
  );
}

// Test 1: Multiline import detection
function testMultilineImport() {
  const filePath = path.join(testDir, "apps/web/features/test/multiline.ts");
  const content = `import { useEngineRuntime } from '@/engine/core/EngineRuntime';
import {
  StyleState,
  StyleTarget,
  TriState,
  type EntityId,
  type LayerStyleSnapshot
} from '@/engine/core/protocol';

export function test() {
  return StyleState.None;
}`;

  fs.writeFileSync(filePath, content);

  // Should detect the multiline import on line 2
  return { name: "Multiline import detection", file: filePath, expectedViolations: 1 };
}

// Test 2: Dynamic import detection
function testDynamicImport() {
  const filePath = path.join(testDir, "apps/web/features/test/dynamic.ts");
  const content = `export async function loadEngine() {
  const engine = await import('@/engine/core/advanced');
  return engine;
}`;

  fs.writeFileSync(filePath, content);
  return { name: "Dynamic import detection", file: filePath, expectedViolations: 1 };
}

// Test 3: Re-export detection
function testReExport() {
  const filePath = path.join(testDir, "apps/web/features/test/reexport.ts");
  const content = `export { CommandOp } from '@/engine/core/commandTypes';
export * from '@/engine/core/protocol';`;

  fs.writeFileSync(filePath, content);
  return { name: "Re-export detection", file: filePath, expectedViolations: 2 };
}

// Test 4: Allowed entrypoint (should pass)
function testAllowedEntrypoint() {
  const filePath = path.join(testDir, "apps/web/features/test/allowed.ts");
  const content = `import { useEngineRuntime } from '@/engine/core/EngineRuntime';

export function test() {
  const runtime = useEngineRuntime();
  return runtime;
}`;

  fs.writeFileSync(filePath, content);
  return { name: "Allowed entrypoint (should pass)", file: filePath, expectedViolations: 0 };
}

// Test 5: runtime.engine access detection
function testRuntimeEngineAccess() {
  const filePath = path.join(testDir, "apps/web/features/test/runtime_access.ts");
  const content = `export function test(runtime: any) {
  const engine = runtime.engine;
  const result = runtime.engine.someMethod();
  return result;
}`;

  fs.writeFileSync(filePath, content);
  return { name: "runtime.engine access detection", file: filePath, expectedViolations: 2 };
}

// Test 6: Commented imports (should be ignored)
function testCommentedCode() {
  const filePath = path.join(testDir, "apps/web/features/test/commented.ts");
  const content = `// import { BadImport } from '@/engine/core/protocol';
/* import { AlsoBad } from '@/engine/core/advanced'; */

import { useEngineRuntime } from '@/engine/core/EngineRuntime';

export function test() {
  // const x = runtime.engine; // This is just a comment
  return null;
}`;

  fs.writeFileSync(filePath, content);
  return { name: "Commented imports (should be ignored)", file: filePath, expectedViolations: 0 };
}

// Run a single test
function runTest(test) {
  // Temporarily modify check_boundaries_ast.js to use test config
  const checkerPath = path.join(__dirname, "check_boundaries_ast.js");
  const originalContent = fs.readFileSync(checkerPath, "utf8");

  try {
    // Inject test config path
    const modifiedContent = originalContent.replace(
      'const boundaryConfigPath = path.join(projectRoot, "tooling", "governance", "boundary_rules.json");',
      `const boundaryConfigPath = "${path.join(testDir, "boundary_rules.json").replace(/\\/g, "\\\\")}";`
    ).replace(
      'const projectRoot = path.resolve(__dirname, "../..");',
      `const projectRoot = "${testDir.replace(/\\/g, "\\\\")}";`
    );

    fs.writeFileSync(checkerPath, modifiedContent);

    // Run checker
    try {
      execSync(`node ${checkerPath}`, { stdio: 'pipe', cwd: projectRoot });
      return { violations: 0 };
    } catch (err) {
      // Parse output to count violations
      const output = err.stdout?.toString() || "";
      const violationMatches = output.match(/❌ Found (\d+) boundary violation/);
      const violations = violationMatches ? parseInt(violationMatches[1]) : 0;
      return { violations };
    }
  } finally {
    // Restore original checker
    fs.writeFileSync(checkerPath, originalContent);
  }
}

function main() {
  console.log("=== Boundary Checker Tests ===\n");

  setup();
  createTestConfig();

  const tests = [
    testMultilineImport(),
    testDynamicImport(),
    testReExport(),
    testAllowedEntrypoint(),
    testRuntimeEngineAccess(),
    testCommentedCode()
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = runTest(test);
    const success = result.violations === test.expectedViolations;

    if (success) {
      console.log(`✅ ${test.name}`);
      console.log(`   Expected ${test.expectedViolations} violations, got ${result.violations}\n`);
      passed++;
    } else {
      console.log(`❌ ${test.name}`);
      console.log(`   Expected ${test.expectedViolations} violations, got ${result.violations}\n`);
      failed++;
    }
  }

  cleanup();

  console.log(`\n=== Test Summary ===`);
  console.log(`Passed: ${passed}/${tests.length}`);
  console.log(`Failed: ${failed}/${tests.length}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
  }
}

main();
