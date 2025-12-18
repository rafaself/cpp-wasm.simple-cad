#include <emscripten/bind.h>

class CadEngine {
public:
    CadEngine() = default;
    int add(int a, int b) const noexcept { return a + b; }
};

EMSCRIPTEN_BINDINGS(cad_engine_module) {
    emscripten::class_<CadEngine>("CadEngine")
        .constructor<>()
        .function("add", &CadEngine::add);
}
