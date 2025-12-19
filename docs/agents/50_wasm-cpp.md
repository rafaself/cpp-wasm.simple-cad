# 50_wasm-cpp

Applies when: tasks touch `cpp/`, `frontend/public/wasm/`, or JS↔WASM interop.

High-priority performance rules (imperative)
- NO heap allocations in hot paths (frame-stepping, mouse-drag loops, render-critical loops).
- Prefer POD / standard-layout structs for shared-memory data. DO NOT place `std::string`, `std::vector`, or raw pointers inside shared structs.
- Interop batching: avoid chatty per-entity calls across the boundary. Provide batch APIs and shared buffers instead.
- Memory stability: resizing containers invalidates external views. Use `reserve()` or fixed-capacity arenas when stability is required.
- Treat `frontend/public/wasm/*` as build outputs; DO NOT hand-edit generated artifacts.

Interop & contract
- Memory layout is a contract; DO NOT change struct layout without coordination.
- DO NOT pass ownership implicitly across boundaries.
- All cross-boundary calls MUST be measurable and minimal.

Native testability
- Use `#ifdef EMSCRIPTEN` to guard Emscripten-specific headers and bindings.
- Provide native polyfills (e.g., `emscripten_get_now`) to allow core logic testing in standard C++ environments.
