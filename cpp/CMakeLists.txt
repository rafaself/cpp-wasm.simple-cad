cmake_minimum_required(VERSION 3.20)
project(cad_engine_wasm LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Make engine/ headers discoverable
include_directories(${PROJECT_SOURCE_DIR})

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

option(ENGINE_ENABLE_WARNINGS "Enable compiler warnings" ON)
option(ENGINE_ENABLE_LOGGING "Enable engine debug logging" OFF)
option(ENGINE_ENABLE_SANITIZERS "Enable ASan/UBSan for native builds" OFF)

function(engine_enable_warnings target)
  if(NOT ENGINE_ENABLE_WARNINGS)
    return()
  endif()
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4)
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic)
  endif()
endfunction()

function(engine_enable_logging target)
  if(ENGINE_ENABLE_LOGGING)
    target_compile_definitions(${target} PRIVATE ENGINE_ENABLE_LOGGING=1)
  endif()
endfunction()

function(engine_enable_sanitizers target)
  if(NOT ENGINE_ENABLE_SANITIZERS)
    return()
  endif()
  if(MSVC OR EMSCRIPTEN)
    return()
  endif()
  target_compile_options(${target} PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer)
  target_link_options(${target} PRIVATE -fsanitize=address,undefined)
endfunction()

# =============================================================================
# Text Engine Dependencies (FreeType, HarfBuzz, msdfgen)
# =============================================================================
include(FetchContent)

# Option to enable/disable text engine (for incremental builds)
option(ENGINE_ENABLE_TEXT "Enable text rendering with FreeType/HarfBuzz/msdfgen" ON)

if(ENGINE_ENABLE_TEXT)
  message(STATUS "Text engine ENABLED - fetching FreeType, HarfBuzz, msdfgen")

  # --- FreeType ---
  set(FT_DISABLE_BZIP2 ON CACHE BOOL "" FORCE)
  set(FT_DISABLE_PNG ON CACHE BOOL "" FORCE)
  set(FT_DISABLE_HARFBUZZ ON CACHE BOOL "" FORCE)
  set(FT_DISABLE_BROTLI ON CACHE BOOL "" FORCE)
  set(FT_DISABLE_ZLIB ON CACHE BOOL "" FORCE)
  set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
  
  FetchContent_Declare(
    freetype
    GIT_REPOSITORY https://github.com/freetype/freetype.git
    GIT_TAG VER-2-13-2
    GIT_SHALLOW TRUE
  )
  FetchContent_MakeAvailable(freetype)

  set(FREETYPE_INCLUDE_DIRS "${freetype_SOURCE_DIR}/include" CACHE PATH "" FORCE)
  set(FREETYPE_LIBRARY freetype CACHE STRING "" FORCE)
  set(FREETYPE_FOUND TRUE CACHE BOOL "" FORCE)

  # --- HarfBuzz ---
  set(HB_HAVE_FREETYPE ON CACHE BOOL "" FORCE)
  set(HB_BUILD_UTILS OFF CACHE BOOL "" FORCE)
  set(HB_BUILD_SUBSET OFF CACHE BOOL "" FORCE)
  set(HB_HAVE_GLIB OFF CACHE BOOL "" FORCE)
  set(HB_HAVE_ICU OFF CACHE BOOL "" FORCE)
  set(HB_HAVE_GOBJECT OFF CACHE BOOL "" FORCE)
  set(HB_HAVE_CAIRO OFF CACHE BOOL "" FORCE)
  
  FetchContent_Declare(
    harfbuzz
    GIT_REPOSITORY https://github.com/harfbuzz/harfbuzz.git
    GIT_TAG 8.3.0
    GIT_SHALLOW TRUE
  )
  FetchContent_MakeAvailable(harfbuzz)

  # --- msdfgen ---
  set(MSDFGEN_BUILD_STANDALONE OFF CACHE BOOL "" FORCE)
  set(MSDFGEN_USE_SKIA OFF CACHE BOOL "" FORCE)
  set(MSDFGEN_USE_VCPKG OFF CACHE BOOL "" FORCE)
  set(MSDFGEN_INSTALL OFF CACHE BOOL "" FORCE)
  set(MSDFGEN_CORE_ONLY ON CACHE BOOL "" FORCE)
  set(MSDFGEN_USE_OPENMP OFF CACHE BOOL "" FORCE)
  
  FetchContent_Declare(
    msdfgen
    GIT_REPOSITORY https://github.com/Chlumsky/msdfgen.git
    GIT_TAG v1.11
    GIT_SHALLOW TRUE
  )
  FetchContent_MakeAvailable(msdfgen)

  add_compile_definitions(ENGINE_TEXT_ENABLED=1)
else()
  message(STATUS "Text engine DISABLED")
  add_compile_definitions(ENGINE_TEXT_ENABLED=0)
endif()

# Main source files for the WASM engine (engine core + extracted modules)
set(ENGINE_SOURCES
  engine/bindings.cpp
  engine.cpp
  engine/internal/engine_state.cpp
  # Command processing
  engine/command/commands.cpp
  engine/command/command_dispatch.cpp
  # Entity management
  engine/entity/entity_manager.cpp
  engine/entity/selection_manager.cpp
  # History (undo/redo)
  engine/history/history_manager.cpp
  # Rendering
  engine/render/render.cpp
  engine/render/vector_tessellation.cpp
  # Interaction (picking, transforms)
  engine/interaction/pick_system.cpp
  engine/interaction/snap_solver.cpp
  engine/interaction/interaction_session.cpp
  engine/interaction/interaction_session_begin.cpp
  engine/interaction/interaction_session_update.cpp
  engine/interaction/interaction_draft.cpp
  engine/interaction/interaction_log.cpp
  # Persistence
  engine/persistence/snapshot.cpp
  engine/persistence/snapshot_build.cpp
  # Implementation (CadEngine method implementations)
  engine/impl/engine_upsert.cpp
  engine/impl/engine_digest.cpp
  engine/impl/engine_style.cpp
  engine/impl/engine_query.cpp
  engine/impl/engine_overlay.cpp
  engine/impl/engine_text.cpp
  engine/impl/engine_snapshot.cpp
  engine/impl/engine_render.cpp
  engine/impl/engine_event.cpp
)

  # Text module sources (conditional)
if(ENGINE_ENABLE_TEXT)
  list(APPEND ENGINE_SOURCES
    engine/text/text_store.cpp
    engine/text/font_manager.cpp
    engine/text/text_layout.cpp
    engine/text/text_shaping.cpp
    engine/text/text_caret.cpp
    engine/text/text_selection_rects.cpp
    engine/text/text_navigation.cpp
    engine/text/atlas_packer.cpp
    engine/text/glyph_atlas.cpp
    engine/text_system.cpp
  )
endif()

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
  
  target_include_directories(engine PRIVATE .)
  engine_enable_warnings(engine)
  engine_enable_logging(engine)
  engine_enable_sanitizers(engine)
  
  # Link text dependencies if enabled
  if(ENGINE_ENABLE_TEXT)
    target_link_libraries(engine PRIVATE freetype harfbuzz msdfgen::msdfgen)
    target_include_directories(engine PRIVATE 
      ${freetype_SOURCE_DIR}/include
      ${harfbuzz_SOURCE_DIR}/src
      ${msdfgen_SOURCE_DIR}
      ${CMAKE_CURRENT_SOURCE_DIR}/msdfgen_config
    )
  endif()
  
  message(STATUS "WASM output dir: ${OUTPUT_DIR}")
endif()


# --- Testing Configuration (GoogleTest) ---
# This section is skipped by the Emscripten toolchain
if(NOT EMSCRIPTEN)
  enable_testing()

  # Add googletest (if not already available from text deps)
  if(NOT TARGET GTest::gtest_main)
    FetchContent_Declare(
      googletest
      GIT_REPOSITORY https://github.com/google/googletest.git
      GIT_TAG v1.15.2
    )
    FetchContent_MakeAvailable(googletest)
  endif()

  # Test sources
  set(TEST_SOURCES
    tests/engine_test.cpp
    tests/commands_test.cpp
    tests/snapshot_test.cpp
    tests/render_test.cpp
    tests/layer_flags_test.cpp
    tests/selection_order_test.cpp
    tests/vector_tessellation_test.cpp
    tests/protocol_info_test.cpp
    tests/event_stream_test.cpp
    tests/overlay_query_test.cpp
    tests/interactive_transform_perf_test.cpp
    tests/history_test.cpp
    tests/style_system_test.cpp
    tests/perf_baseline_test.cpp
  )
  
  # Add text tests if enabled
  if(ENGINE_ENABLE_TEXT)
    list(APPEND TEST_SOURCES
      tests/text_store_test.cpp
      tests/text_layout_test.cpp
      tests/glyph_atlas_test.cpp
      tests/text_commands_test.cpp
      tests/text_coordinate_system_test.cpp
    )
  endif()

  # Add test executable
  add_executable(engine_tests ${TEST_SOURCES})
  
  # Link engine sources and gtest
  target_link_libraries(
    engine_tests
    PRIVATE GTest::gtest_main
  )
  target_include_directories(engine_tests PRIVATE .)
  engine_enable_warnings(engine_tests)
  engine_enable_logging(engine_tests)
  engine_enable_sanitizers(engine_tests)
  
  # Link text dependencies if enabled
  if(ENGINE_ENABLE_TEXT)
    target_link_libraries(engine_tests PRIVATE freetype harfbuzz msdfgen::msdfgen)
    target_include_directories(engine_tests PRIVATE 
      ${freetype_SOURCE_DIR}/include
      ${harfbuzz_SOURCE_DIR}/src
      ${msdfgen_SOURCE_DIR}
      ${CMAKE_CURRENT_SOURCE_DIR}/msdfgen_config
    )
    # Define path to HarfBuzz source dir for test fixtures
    target_compile_definitions(engine_tests PRIVATE
      HARFBUZZ_SOURCE_DIR="${harfbuzz_SOURCE_DIR}"
    )
  endif()

  # Include engine implementation (as a library-like component)
  target_sources(engine_tests PRIVATE ${ENGINE_SOURCES})

  # Add test to CTest
  include(GoogleTest)
  gtest_discover_tests(engine_tests)
endif()
