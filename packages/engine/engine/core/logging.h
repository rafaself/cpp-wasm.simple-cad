#pragma once

#include <cstdio>

#ifndef ENGINE_ENABLE_LOGGING
#define ENGINE_ENABLE_LOGGING 0
#endif

#if ENGINE_ENABLE_LOGGING
#define ENGINE_LOG_DEBUG(...) \
    do { \
        std::fprintf(stderr, __VA_ARGS__); \
        std::fprintf(stderr, "\n"); \
    } while (0)
#define ENGINE_LOG_WARN(...) \
    do { \
        std::fprintf(stderr, __VA_ARGS__); \
        std::fprintf(stderr, "\n"); \
    } while (0)
#else
#define ENGINE_LOG_DEBUG(...) do { } while (0)
#define ENGINE_LOG_WARN(...) do { } while (0)
#endif
