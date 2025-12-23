#include <gtest/gtest.h>
#include <fstream>
#include <vector>
#include <string>

// HACK: Expose private members for white-box testing of the render pipeline
// This allows us to inspect the generated vertex buffer (textQuadBuffer_) directly.
#define private public
#include "engine/engine.h"
#undef private

// Helper to load font file
std::vector<uint8_t> loadFile(const std::string& path) {
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file.is_open()) return {};
    std::streamsize size = file.tellg();
    file.seekg(0, std::ios::beg);
    std::vector<uint8_t> buffer(size);
    if (file.read((char*)buffer.data(), size)) return buffer;
    return {};
}

class TextRenderTopologyTest : public ::testing::Test {
protected:
    CadEngine engine;
    bool fontLoaded = false;
    uint32_t fontId = 1;

    void SetUp() override {
        engine.clear();
        engine.initializeTextSystem();
        
        // Try loading project font (relative to build dir or repo root)
        // This ensures the test runs reliably without depending on system fonts.
        std::vector<std::string> fontPaths = {
            "../../frontend/public/fonts/DejaVuSans.ttf",       // From cpp/build
            "../../../frontend/public/fonts/DejaVuSans.ttf",    // From cpp/build/Debug
            "frontend/public/fonts/DejaVuSans.ttf",             // From repo root
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"   // System fallback
        };
        
        for (const auto& path : fontPaths) {
            auto data = loadFile(path);
            if (!data.empty()) {
                if (engine.loadFont(fontId, reinterpret_cast<uintptr_t>(data.data()), data.size())) {
                    fontLoaded = true;
                    break;
                }
            }
        }
    }
};

TEST_F(TextRenderTopologyTest, VerifyVertexTopologyAndUVs) {
    // This test verifies that the Text Quads are generated with the correct
    // Coordinate System (Y-Up) and UV Mapping to solve the "Flip" issue.
    
    if (!fontLoaded) GTEST_SKIP() << "No system font available to generate quads";

    // Setup Text Payload
    TextPayloadHeader header{};
    header.x = 0; header.y = 0;
    header.runCount = 1;
    header.contentLength = 1; 
    
    TextRunPayload run{};
    run.length = 1;
    run.fontId = fontId;
    run.fontSize = 16.0f;
    run.colorRGBA = 0xFFFFFFFF;
    
    // Create text entity "A"
    engine.upsertText(100, header, &run, 1, "A", 1);
    
    // Force layout and quad generation (Bypassing command loop for unit test isolation)
    engine.textLayoutEngine_.layoutText(100); 
    engine.rebuildTextQuadBuffer();
    
    const auto& buffer = engine.textQuadBuffer_;
    ASSERT_FALSE(buffer.empty()) << "Quad buffer should not be empty after layout";
    // Each vertex has 9 floats. 6 vertices per quad.
    ASSERT_EQ(buffer.size(), 54u); 
    
    // Vertex Structure (Interleaved): X Y Z U V R G B A
    // Triangle 1: BL -> BR -> TR
    // Triangle 2: BL -> TR -> TL
    // (Indices based on standard quad generation in engine.cpp)
    
    // Vertex 0 (Bottom-Left Geometry)
    float v0_y = buffer[1];
    float v0_v = buffer[4];
    
    // Vertex 2 (Top-Right Geometry) - 3rd vertex (index 2)
    float v2_y = buffer[18 + 1];
    float v2_v = buffer[18 + 4];
    
    // 1. Verify Geometric Orientation (Y-Up System)
    // In Y-Up, Top Y > Bottom Y.
    EXPECT_GT(v2_y, v0_y) 
        << "Text geometry is inverted! Top Y should be > Bottom Y (Y-Up system).";
        
    // 2. Verify UV Orientation (Fix for Inverted Rendering)
    // We fixed the rendering by mapping Top Geometry to v0 (Top/Low V)
    // and Bottom Geometry to v1 (Bottom/High V) to counter the texture memory layout.
    // Standard Atlas: Top V (v0) < Bottom V (v1).
    // So Top Geometry should correspond to Lower V value.
    
    EXPECT_NE(v0_v, v2_v) << "UV-V coordinate is constant! Textured quad is degenerate.";
    EXPECT_LT(v2_v, v0_v) << "UV mapping inconsistent with 'Anti-Flip' Fix (Expected Top Geometry -> Low V).";
}
