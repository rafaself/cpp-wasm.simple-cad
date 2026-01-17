# Engine Agents Guide (`packages/engine`)

## Core Responsibilities
- **Geometry Kernel**: The mathematical heart of the application.
- **Rendering**: Generate vertex buffers for WebGL.
- **Persistence**: Save/Load binary snapshots.

## Commands
- **Configure**: `cmake -S . -B build_native -DCMAKE_BUILD_TYPE=Release`
- **Build**: `cmake --build build_native`
- **Test**: `ctest --test-dir build_native`

## Architecture Rules (C++20)
1. **Performance**: 
   - No `new`/`malloc` in `update()` or `render()` loops.
   - Use `std::vector::reserve`.
   - Prefer stack allocation.
2. **WASM Bindings**:
   - Expose minimal API via `engine/bindings.cpp`.
   - Use POD structs for data transfer.
3. **Safety**:
   - Enable ASan/UBSan during local development.
   - 0 warnings policy (`-Wall -Wextra`).

## Testing
- Use GoogleTest.
- Every new geometric feature needs a unit test.
