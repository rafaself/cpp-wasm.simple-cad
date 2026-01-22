#!/usr/bin/env node
/**
 * Unit tests for AST import extraction
 * Verifies the core parsing functionality detects multiline imports, dynamic imports, and re-exports
 */

const fs = require("fs");
const path = require("path");

// Load TypeScript (same logic as check_boundaries_ast.js)
let ts;
try {
  ts = require("typescript");
} catch (e) {
  try {
    ts = require("../../apps/web/node_modules/typescript");
  } catch (e2) {
    console.error("Error: TypeScript not found");
    process.exit(1);
  }
}

/**
 * Extract all import declarations from TypeScript source code using AST
 */
function extractImports(code, fileName = "test.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const imports = [];

  function visit(node) {
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
 * Find all runtime.engine usage in TypeScript source code
 */
function findRuntimeEngineUsage(code, fileName = "test.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const usages = [];

  function visit(node) {
    if (ts.isPropertyAccessExpression(node)) {
      const obj = node.expression;
      const prop = node.name;

      // Direct: runtime.engine
      if (ts.isIdentifier(obj) && obj.text === 'runtime' &&
          ts.isIdentifier(prop) && prop.text === 'engine') {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        usages.push({ line });
      }

      // Chained: something.runtime.engine
      if (ts.isPropertyAccessExpression(obj) &&
          ts.isIdentifier(obj.name) && obj.name.text === 'runtime' &&
          ts.isIdentifier(prop) && prop.text === 'engine') {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        usages.push({ line });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return usages;
}

function runTests() {
  const tests = [
    {
      name: "Single-line import",
      code: `import { foo } from '@/engine/core/protocol';`,
      expectedImports: 1,
      test: (imports) => {
        return imports.length === 1 &&
               imports[0].type === 'import' &&
               imports[0].path === '@/engine/core/protocol' &&
               imports[0].line === 1;
      }
    },
    {
      name: "Multiline import",
      code: `import {
  StyleState,
  StyleTarget,
  TriState
} from '@/engine/core/protocol';`,
      expectedImports: 1,
      test: (imports) => {
        return imports.length === 1 &&
               imports[0].type === 'import' &&
               imports[0].path === '@/engine/core/protocol' &&
               imports[0].line === 1;
      }
    },
    {
      name: "Multiple imports",
      code: `import { a } from '@/engine/core/a';
import { b } from '@/engine/core/b';
import { c } from '@/engine/core/c';`,
      expectedImports: 3,
      test: (imports) => {
        return imports.length === 3 &&
               imports[0].path === '@/engine/core/a' &&
               imports[1].path === '@/engine/core/b' &&
               imports[2].path === '@/engine/core/c';
      }
    },
    {
      name: "Dynamic import",
      code: `async function load() {
  const mod = await import('@/engine/core/dynamic');
  return mod;
}`,
      expectedImports: 1,
      test: (imports) => {
        return imports.length === 1 &&
               imports[0].type === 'dynamic' &&
               imports[0].path === '@/engine/core/dynamic' &&
               imports[0].line === 2;
      }
    },
    {
      name: "Re-export",
      code: `export { CommandOp } from '@/engine/core/commandTypes';
export * from '@/engine/core/protocol';`,
      expectedImports: 2,
      test: (imports) => {
        return imports.length === 2 &&
               imports[0].type === 'export' &&
               imports[1].type === 'export' &&
               imports[0].path === '@/engine/core/commandTypes' &&
               imports[1].path === '@/engine/core/protocol';
      }
    },
    {
      name: "Commented import (should be detected - AST ignores comments)",
      code: `// import { BadImport } from '@/engine/core/protocol';
import { GoodImport } from '@/engine/core/good';`,
      expectedImports: 1,
      test: (imports) => {
        // AST parser ignores comments, so commented imports are not in AST
        return imports.length === 1 &&
               imports[0].path === '@/engine/core/good';
      }
    },
    {
      name: "runtime.engine access",
      code: `function test(runtime: any) {
  const engine = runtime.engine;
  const result = runtime.engine.someMethod();
  return result;
}`,
      expectedRuntimeAccess: 2,
      test: (_, runtimeUsage) => {
        return runtimeUsage.length === 2 &&
               runtimeUsage[0].line === 2 &&
               runtimeUsage[1].line === 3;
      }
    },
    {
      name: "No runtime.engine in comments",
      code: `function test() {
  // const x = runtime.engine; // This is just a comment
  /* runtime.engine should be ignored */
  return null;
}`,
      expectedRuntimeAccess: 0,
      test: (_, runtimeUsage) => {
        return runtimeUsage.length === 0;
      }
    }
  ];

  console.log("=== AST Parser Tests ===\n");

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const imports = extractImports(t.code);
    const runtimeUsage = findRuntimeEngineUsage(t.code);

    const success = t.test(imports, runtimeUsage);

    if (success) {
      console.log(`✅ ${t.name}`);
      if (t.expectedImports !== undefined) {
        console.log(`   Found ${imports.length} import(s) as expected`);
      }
      if (t.expectedRuntimeAccess !== undefined) {
        console.log(`   Found ${runtimeUsage.length} runtime.engine access(es) as expected`);
      }
      passed++;
    } else {
      console.log(`❌ ${t.name}`);
      if (t.expectedImports !== undefined) {
        console.log(`   Expected ${t.expectedImports} imports, got ${imports.length}`);
        console.log(`   Imports:`, JSON.stringify(imports, null, 2));
      }
      if (t.expectedRuntimeAccess !== undefined) {
        console.log(`   Expected ${t.expectedRuntimeAccess} accesses, got ${runtimeUsage.length}`);
        console.log(`   Runtime usage:`, JSON.stringify(runtimeUsage, null, 2));
      }
      failed++;
    }
    console.log();
  }

  console.log("=== Test Summary ===");
  console.log(`Passed: ${passed}/${tests.length}`);
  console.log(`Failed: ${failed}/${tests.length}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\n✅ All AST parser tests passed!");
  }
}

runTests();
