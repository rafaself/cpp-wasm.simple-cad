cmake_minimum_required(VERSION 3.20)
project(cad_engine_wasm LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

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

# Source
add_executable(engine engine.cpp)

# Compile options per config
target_compile_options(engine PRIVATE
  $<$<CONFIG:Debug>:-O0 -g>
  $<$<CONFIG:Release>:-O3 -flto>
)

# Linker / Emscripten flags
target_link_options(engine PRIVATE
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sENVIRONMENT=web
  -sALLOW_MEMORY_GROWTH=1
  -lembind
)

# Ensure JS/WASM land in the chosen output dir
set_target_properties(engine PROPERTIES OUTPUT_NAME "engine")

message(STATUS "WASM output dir: ${OUTPUT_DIR}")
