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

#endif // ELETROCAD_ENGINE_UTIL_H
