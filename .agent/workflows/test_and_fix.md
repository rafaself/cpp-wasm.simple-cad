---
description: Run full test suite and build process, fixing any errors encountered.
---

1. Run C++ Engine Tests

   - Command: `make ctest`
   - Behavior: Run the C++ unit tests. If they fail, analyze the failure, fix the C++ code, and re-run until they pass.

2. Build WebAssembly Module

   - Command: `make wasm`
   - Behavior: Compile the C++ engine to WASM. If the build fails, fix the compilation errors and retry.

3. Run Frontend Tests

   - Command: `pnpm test`
   - Behavior: Run the frontend unit tests. If any tests fail, fix the implementation or the test case as appropriate.

4. Build Frontend Application
   - Command: `pnpm build`
   - Behavior: Build the final frontend artifact. Fix any build errors (types, linting, etc.) that arise.
