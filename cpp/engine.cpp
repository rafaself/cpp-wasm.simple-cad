#include <emscripten/bind.h>
#include <cstdint>
#include <vector>

class CadEngine {
public:
    CadEngine() {
        // Pre-reserve to reduce the chance of vector growth (and pointer invalidation) early on.
        // Phase 2 goal is "stable views" in JS over WASM memory.
        vertices.reserve(50000);
    }

    int add(int a, int b) const noexcept { return a + b; }

    void addWall(float x, float y, float w, float h) {
        // 2 triangles (6 vertices) in XY plane (z=0)
        const float x0 = x;
        const float y0 = y;
        const float x1 = x + w;
        const float y1 = y + h;
        constexpr float z = 0.0f;

        // Triangle 1: (x0,y0) (x1,y0) (x1,y1)
        pushVertex(x0, y0, z);
        pushVertex(x1, y0, z);
        pushVertex(x1, y1, z);

        // Triangle 2: (x0,y0) (x1,y1) (x0,y1)
        pushVertex(x0, y0, z);
        pushVertex(x1, y1, z);
        pushVertex(x0, y1, z);
    }

    std::uint32_t getVertexCount() const noexcept {
        // vertex count (not float count)
        return static_cast<std::uint32_t>(vertices.size() / 3);
    }

    std::uintptr_t getVertexDataPtr() const noexcept {
        return reinterpret_cast<std::uintptr_t>(vertices.data());
    }

private:
    std::vector<float> vertices;

    void pushVertex(float x, float y, float z) {
        vertices.push_back(x);
        vertices.push_back(y);
        vertices.push_back(z);
    }
};

EMSCRIPTEN_BINDINGS(cad_engine_module) {
    emscripten::class_<CadEngine>("CadEngine")
        .constructor<>()
        .function("add", &CadEngine::add)
        .function("addWall", &CadEngine::addWall)
        .function("getVertexCount", &CadEngine::getVertexCount)
        .function("getVertexDataPtr", &CadEngine::getVertexDataPtr);
}
