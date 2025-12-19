
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <cstdint>
#include <string>
#include <vector>

class CadEngine {
public:
    CadEngine() {
        // Pre-reserve to reduce the chance of vector growth (and pointer invalidation) early on.
        // Phase 2 goal is "stable views" in JS over WASM memory.
        triangleVertices.reserve(defaultCapacityFloats);
        lineVertices.reserve(defaultLineCapacityFloats);
    }

    int add(int a, int b) const noexcept { return a + b; }

    void clear() noexcept {
        triangleVertices.clear();
        lineVertices.clear();
        generation++;
    }

    void addWall(float x, float y, float w, float h) {
        addRect(x, y, w, h);
    }

    void loadShapes(emscripten::val shapes) {
        clear();
        const auto len = shapes["length"].as<std::uint32_t>();
        for (std::uint32_t i = 0; i < len; ++i) {
            auto s = shapes[i];
            const std::string type = s["type"].as<std::string>();
            if (type == "rect") {
                const float x = s["x"].as<float>();
                const float y = s["y"].as<float>();
                const float w = s["width"].as<float>();
                const float h = s["height"].as<float>();
                addRect(x, y, w, h);
                addRectOutline(x, y, w, h);
            } else if (type == "line") {
                auto points = s["points"];
                if (points["length"].as<std::uint32_t>() >= 2) {
                    const auto p0 = points[static_cast<std::uint32_t>(0)];
                    const auto p1 = points[static_cast<std::uint32_t>(1)];
                    addLineSegment(p0["x"].as<float>(), p0["y"].as<float>(), p1["x"].as<float>(), p1["y"].as<float>());
                }
            } else if (type == "polyline") {
                auto points = s["points"];
                const auto count = points["length"].as<std::uint32_t>();
                if (count < 2) continue;
                for (std::uint32_t j = 0; j + 1 < count; ++j) {
                    const auto p0 = points[j];
                    const auto p1 = points[j + 1];
                    addLineSegment(p0["x"].as<float>(), p0["y"].as<float>(), p1["x"].as<float>(), p1["y"].as<float>());
                }
            }
        }
        generation++;
    }

    std::uint32_t getVertexCount() const noexcept {
        // vertex count (not float count) for triangle buffer
        return static_cast<std::uint32_t>(triangleVertices.size() / 3);
    }

    std::uintptr_t getVertexDataPtr() const noexcept {
        return reinterpret_cast<std::uintptr_t>(triangleVertices.data());
    }

    struct BufferMeta {
        std::uint32_t generation;
        std::uint32_t vertexCount;
        std::uint32_t capacity;   // in vertices
        std::uint32_t floatCount; // convenience for view length
        std::uintptr_t ptr;       // byte offset in WASM linear memory
    };

    BufferMeta getPositionBufferMeta() const noexcept {
        return buildMeta(triangleVertices);
    }

    BufferMeta getLineBufferMeta() const noexcept {
        return buildMeta(lineVertices);
    }

private:
    static constexpr std::size_t defaultCapacityFloats = 50000;   // ~16.6k vertices
    static constexpr std::size_t defaultLineCapacityFloats = 20000; // ~6.6k line vertices

    std::vector<float> triangleVertices;
    std::vector<float> lineVertices;
    std::uint32_t generation{0};

    BufferMeta buildMeta(const std::vector<float>& buffer) const noexcept {
        const std::uint32_t vertexCount = static_cast<std::uint32_t>(buffer.size() / 3);
        const std::uint32_t capacityVertices = static_cast<std::uint32_t>(buffer.capacity() / 3);
        const std::uint32_t floatCount = static_cast<std::uint32_t>(buffer.size());
        return BufferMeta{generation, vertexCount, capacityVertices, floatCount, reinterpret_cast<std::uintptr_t>(buffer.data())};
    }

    void pushVertex(float x, float y, float z, std::vector<float>& target) {
        target.push_back(x);
        target.push_back(y);
        target.push_back(z);
    }

    void addRect(float x, float y, float w, float h) {
        const float x0 = x;
        const float y0 = y;
        const float x1 = x + w;
        const float y1 = y + h;
        constexpr float z = 0.0f;

        // Triangle 1: (x0,y0) (x1,y0) (x1,y1)
        pushVertex(x0, y0, z, triangleVertices);
        pushVertex(x1, y0, z, triangleVertices);
        pushVertex(x1, y1, z, triangleVertices);

        // Triangle 2: (x0,y0) (x1,y1) (x0,y1)
        pushVertex(x0, y0, z, triangleVertices);
        pushVertex(x1, y1, z, triangleVertices);
        pushVertex(x0, y1, z, triangleVertices);
    }

    void addRectOutline(float x, float y, float w, float h) {
        const float x0 = x;
        const float y0 = y;
        const float x1 = x + w;
        const float y1 = y + h;
        constexpr float z = 0.0f;
        addLineSegment(x0, y0, x1, y0, z);
        addLineSegment(x1, y0, x1, y1, z);
        addLineSegment(x1, y1, x0, y1, z);
        addLineSegment(x0, y1, x0, y0, z);
    }

    void addLineSegment(float x0, float y0, float x1, float y1, float z = 0.0f) {
        pushVertex(x0, y0, z, lineVertices);
        pushVertex(x1, y1, z, lineVertices);
    }
};

EMSCRIPTEN_BINDINGS(cad_engine_module) {
    emscripten::class_<CadEngine>("CadEngine")
        .constructor<>()
        .function("add", &CadEngine::add)
        .function("addWall", &CadEngine::addWall)
        .function("clear", &CadEngine::clear)
        .function("loadShapes", &CadEngine::loadShapes)
        .function("getVertexCount", &CadEngine::getVertexCount)
        .function("getVertexDataPtr", &CadEngine::getVertexDataPtr)
        .function("getPositionBufferMeta", &CadEngine::getPositionBufferMeta)
        .function("getLineBufferMeta", &CadEngine::getLineBufferMeta);

    emscripten::value_object<CadEngine::BufferMeta>("BufferMeta")
        .field("generation", &CadEngine::BufferMeta::generation)
        .field("vertexCount", &CadEngine::BufferMeta::vertexCount)
        .field("capacity", &CadEngine::BufferMeta::capacity)
        .field("floatCount", &CadEngine::BufferMeta::floatCount)
        .field("ptr", &CadEngine::BufferMeta::ptr);
}
