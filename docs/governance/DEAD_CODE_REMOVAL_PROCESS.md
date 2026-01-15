# Dead Code Removal — Process & Proof

Dead code removal is allowed **only** when it is proven unused and proven safe. The steps below are mandatory for every removal batch.

## Two-Step Proof (must have both)
1) **Prove unused**
   - TypeScript: run the dead-code report (`node scripts/deadcode_ts_report.js`) and capture TSC unused diagnostics, import graph candidates, and any lint/depcheck signals.
   - C++: run the C++ report (`bash scripts/deadcode_cpp_report.sh`) to surface symbols with no references (nm/objdump) and translation units with no includes.
   - Ripgrep evidence: show no imports/refs (`rg` over `frontend/**` or `cpp/**`).
   - Embind: confirm the symbol is **not** listed in `docs/api/engine_api_manifest.json`.

2) **Prove safe to delete**
   - Run full test suites (Vitest + CTest) and governance checks.
   - For Embind-bound APIs, also show zero TS call sites (manifest + `rg`) and update the manifest if anything changes.
   - If any ambiguity remains, **do not delete**; log it in the ambiguity section of the report.

## Danger Zones (extra scrutiny)
- **Embind exports / WASM bridge**: never delete without manifest proof and TS call-site search.
- **Text system**: shaping, caret/nav, selection geometry—ensure no accidental behavior drift.
- **Importers/persistence**: DXF/PDF import, snapshot/load, history—user data risk.
- **Hot paths**: input handlers, render loop, drafting, picking—performance regressions are unacceptable.

## Evidence required per PR/batch
- Link to the generated reports under `reports/`.
+- `rg` / import-graph proof of no references.
- Statement that the symbol is absent from `docs/api/engine_api_manifest.json` (or updated if removed).
- Test commands and results (frontend + C++).
- List of deleted files/blocks (keep batches small: 10–30 max).

## Rollback guidance
- Keep deletions isolated per batch to revert quickly.
- If any new failure appears after merge, revert the specific batch commit first.
- For Embind/API surface, re-run `scripts/check_engine_api_manifest.js` after any rollback to keep manifests in sync.
