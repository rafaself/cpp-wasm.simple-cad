#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const budgetsPath =
  process.env.PERF_BUDGETS_PATH ??
  path.join(repoRoot, 'tooling', 'governance', 'perf_budgets.json');
const resultsPath =
  process.env.PERF_RESULTS_PATH ??
  path.join(repoRoot, 'tooling', 'governance', 'perf_results.json');

if (process.env.PERF_BUDGETS_SKIP === '1') {
  console.log('Perf budget check skipped (PERF_BUDGETS_SKIP=1).');
  process.exit(0);
}

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${path.relative(repoRoot, filePath)}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label} is not valid JSON: ${err.message}`);
  }
}

function assertNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function normalizeFixturePath(candidate) {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new Error('fixture path must be a non-empty string');
  }
  const normalized = candidate.replace(/^\.\//, '');
  return path.isAbsolute(normalized) ? normalized : path.join(repoRoot, normalized);
}

function main() {
  let budgets;
  let results;
  try {
    budgets = loadJson(budgetsPath, 'Perf budgets');
    results = loadJson(resultsPath, 'Perf results');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (!budgets || typeof budgets !== 'object') {
    console.error('Perf budgets JSON must be an object.');
    process.exit(1);
  }
  if (!results || typeof results !== 'object') {
    console.error('Perf results JSON must be an object.');
    process.exit(1);
  }

  const budgetsFixture = normalizeFixturePath(budgets.fixture);
  const resultsFixture = normalizeFixturePath(results.fixture);

  if (!fs.existsSync(budgetsFixture)) {
    console.error(`Perf fixture missing: ${path.relative(repoRoot, budgetsFixture)}`);
    process.exit(1);
  }
  if (budgetsFixture !== resultsFixture) {
    console.error('Perf fixture mismatch between budgets and results.');
    console.error(`- budgets: ${path.relative(repoRoot, budgetsFixture)}`);
    console.error(`- results: ${path.relative(repoRoot, resultsFixture)}`);
    process.exit(1);
  }

  if (!budgets.metrics || typeof budgets.metrics !== 'object') {
    console.error('Perf budgets must include a metrics object.');
    process.exit(1);
  }
  if (!results.metrics || typeof results.metrics !== 'object') {
    console.error('Perf results must include a metrics object.');
    process.exit(1);
  }

  const failures = [];
  const summary = [];
  for (const [metric, budgetValue] of Object.entries(budgets.metrics)) {
    try {
      assertNumber(budgetValue, `Budget ${metric}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    const resultValue = results.metrics[metric];
    try {
      assertNumber(resultValue, `Result ${metric}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    summary.push({ metric, result: resultValue, budget: budgetValue });
    if (resultValue > budgetValue) {
      failures.push({ metric, result: resultValue, budget: budgetValue });
    }
  }

  if (failures.length > 0) {
    console.error('Perf budget regression detected:');
    for (const failure of failures) {
      console.error(
        `- ${failure.metric}: ${failure.result} > ${failure.budget}`,
      );
    }
    process.exit(1);
  }

  console.log('Perf budget check passed.');
  for (const entry of summary) {
    console.log(
      `- ${entry.metric}: ${entry.result} (budget ${entry.budget})`,
    );
  }
}

main();
