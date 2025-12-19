cmake_minimum_required(VERSION 3.20)
project(cad_engine_wasm LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

# Main source file for the WASM engine
set(ENGINE_SOURCES engine.cpp)

# --- WASM Build Configuration (Emscripten) ---
if(EMSCRIPTEN)
  set(DEFAULT_OUTPUT_DIR "${PROJECT_SOURCE_DIR}/../frontend/public/wasm")
  set(OUTPUT_DIR "${OUTPUT_DIR}" CACHE PATH "Output directory for wasm artifacts" )
  if(NOT OUTPUT_DIR)
    set(OUTPUT_DIR "${DEFAULT_OUTPUT_DIR}")
  endif()

  file(MAKE_DIRECTORY "${OUTPUT_DIR}")
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}")
  set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY "${OUTPUT_DIR}")
  set(CMAKE_LIBRARY_OUTPUT_DIRECTORY "${OUTPUT_DIR}")
  set(CMAKE_EXECUTABLE_SUFFIX ".js")

  # Linker / Emscripten flags
  option(ENGINE_ALLOW_MEMORY_GROWTH "Allow WASM memory growth (dev-friendly, but invalidates JS views on grow)" ON)
  set(ENGINE_ALLOW_MEMORY_GROWTH_FLAG "1")
  if(NOT ENGINE_ALLOW_MEMORY_GROWTH)
    set(ENGINE_ALLOW_MEMORY_GROWTH_FLAG "0")
  endif()

  set(EMPSCRIPTEN_LINK_FLAGS
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sENVIRONMENT=web
    -sALLOW_MEMORY_GROWTH=${ENGINE_ALLOW_MEMORY_GROWTH_FLAG}
    -lembind
  )
endif()

# --- Main WASM Executable ---
if(EMSCRIPTEN)
  add_executable(engine ${ENGINE_SOURCES})
  target_link_options(engine PRIVATE ${EMPSCRIPTEN_LINK_FLAGS})
  set_target_properties(engine PROPERTIES OUTPUT_NAME "engine")
  message(STATUS "WASM output dir: ${OUTPUT_DIR}")
endif()


# --- Testing Configuration (GoogleTest) ---
# This section is skipped by the Emscripten toolchain
if(NOT EMSCRIPTEN)
  enable_testing()

  # Add googletest
  include(FetchContent)
  FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG main
  )
  FetchContent_MakeAvailable(googletest)

  # Add test executable
  add_executable(
    engine_tests
    tests/engine_test.cpp
  )
  
  # Link engine sources and gtest
  target_link_libraries(
    engine_tests
    PRIVATE GTest::gtest_main
  )

  # Include engine implementation (as a library-like component)
  target_sources(engine_tests PRIVATE ${ENGINE_SOURCES})

  # Add test to CTest
  include(GoogleTest)
  gtest_discover_tests(engine_tests)
endif()
