#ifndef ELETROCAD_ENGINE_UTIL_H
#define ELETROCAD_ENGINE_UTIL_H

#include <cstdint>
#include <cstddef>
#include <cstring>

#ifdef EMSCRIPTEN
#include <emscripten/emscripten.h>
#else
#include <chrono>
// Polyfill for native testing
inline double emscripten_get_now() {
    using namespace std::chrono;
    return duration_cast<duration<double, std::milli>>(high_resolution_clock::now().time_since_epoch()).count();
}
#endif

static inline std::uint32_t readU32(const std::uint8_t* src, std::size_t offset) noexcept {
    std::uint32_t v;
    std::memcpy(&v, src + offset, sizeof(v));
    return v;
}

static inline float readF32(const std::uint8_t* src, std::size_t offset) noexcept {
    float v;
    std::memcpy(&v, src + offset, sizeof(v));
    return v;
}

static inline void writeU32LE(std::uint8_t* dst, std::size_t offset, std::uint32_t v) noexcept {
    std::memcpy(dst + offset, &v, sizeof(v));
}

static inline void writeF32LE(std::uint8_t* dst, std::size_t offset, float v) noexcept {
    std::memcpy(dst + offset, &v, sizeof(v));
}

static inline void unpackColorRGBA(std::uint32_t rgba, float& r, float& g, float& b, float& a) noexcept {
    r = static_cast<float>((rgba >> 24) & 0xFF) / 255.0f;
    g = static_cast<float>((rgba >> 16) & 0xFF) / 255.0f;
    b = static_cast<float>((rgba >> 8) & 0xFF) / 255.0f;
    a = static_cast<float>(rgba & 0xFF) / 255.0f;
}

static inline std::uint32_t packColorRGBA(float r, float g, float b, float a) noexcept {
    const auto clamp = [](float v) -> std::uint32_t {
        if (v < 0.0f) v = 0.0f;
        if (v > 1.0f) v = 1.0f;
        return static_cast<std::uint32_t>(v * 255.0f + 0.5f);
    };
    const std::uint32_t ri = clamp(r);
    const std::uint32_t gi = clamp(g);
    const std::uint32_t bi = clamp(b);
    const std::uint32_t ai = clamp(a);
    return (ri << 24) | (gi << 16) | (bi << 8) | ai;
}

#endif // ELETROCAD_ENGINE_UTIL_H
