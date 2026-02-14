cmake_minimum_required(VERSION 3.20)
project(cad_engine_wasm LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Make engine/ headers discoverable
include_directories(${PROJECT_SOURCE_DIR}/src ${PROJECT_SOURCE_DIR} ${PROJECT_SOURCE_DIR}/include)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

option(ENGINE_ENABLE_WARNINGS "Enable compiler warnings" ON)
option(ENGINE_ENABLE_LOGGING "Enable engine debug logging" OFF)
option(ENGINE_ENABLE_SANITIZERS "Enable ASan/UBSan for native builds" OFF)
option(ENGINE_PROFILE_MINIMAL_2D "Build minimal 2D profile (Rect/Line/Arrow/Text + pick + move/resize + z-order)" ON)
option(ENGINE_FEATURE_WEBGPU "Enable WebGPU backend" OFF)
option(ENGINE_FEATURE_POLYLINE "Enable polyline shape support" ON)
option(ENGINE_FEATURE_CIRCLE "Enable circle shape support" ON)
option(ENGINE_FEATURE_POLYGON "Enable polygon shape support" ON)
option(ENGINE_FEATURE_DRAFT "Enable draft workflow" ON)
option(ENGINE_FEATURE_ROTATE "Enable rotate transforms" ON)
option(ENGINE_FEATURE_VERTEX_EDIT "Enable vertex/edge editing transforms" ON)
option(ENGINE_FEATURE_TEXT_EDITING "Enable in-canvas text editing commands (caret/selection/content/style edits)" ON)

if(ENGINE_PROFILE_MINIMAL_2D)
  set(ENGINE_FEATURE_WEBGPU OFF CACHE BOOL "Enable WebGPU backend" FORCE)
  set(ENGINE_FEATURE_POLYLINE OFF CACHE BOOL "Enable polyline shape support" FORCE)
  set(ENGINE_FEATURE_CIRCLE OFF CACHE BOOL "Enable circle shape support" FORCE)
  set(ENGINE_FEATURE_POLYGON OFF CACHE BOOL "Enable polygon shape support" FORCE)
  set(ENGINE_FEATURE_DRAFT OFF CACHE BOOL "Enable draft workflow" FORCE)
  set(ENGINE_FEATURE_ROTATE OFF CACHE BOOL "Enable rotate transforms" FORCE)
  set(ENGINE_FEATURE_VERTEX_EDIT OFF CACHE BOOL "Enable vertex/edge editing transforms" FORCE)
  set(ENGINE_FEATURE_TEXT_EDITING OFF CACHE BOOL "Enable in-canvas text editing commands (caret/selection/content/style edits)" FORCE)
endif()

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

function(engine_apply_feature_definitions target)
  target_compile_definitions(${target} PRIVATE
    ENGINE_PROFILE_MINIMAL_2D=$<BOOL:${ENGINE_PROFILE_MINIMAL_2D}>
    ENGINE_FEATURE_WEBGPU=$<BOOL:${ENGINE_FEATURE_WEBGPU}>
    ENGINE_FEATURE_POLYLINE=$<BOOL:${ENGINE_FEATURE_POLYLINE}>
    ENGINE_FEATURE_CIRCLE=$<BOOL:${ENGINE_FEATURE_CIRCLE}>
    ENGINE_FEATURE_POLYGON=$<BOOL:${ENGINE_FEATURE_POLYGON}>
    ENGINE_FEATURE_DRAFT=$<BOOL:${ENGINE_FEATURE_DRAFT}>
    ENGINE_FEATURE_ROTATE=$<BOOL:${ENGINE_FEATURE_ROTATE}>
    ENGINE_FEATURE_VERTEX_EDIT=$<BOOL:${ENGINE_FEATURE_VERTEX_EDIT}>
    ENGINE_FEATURE_TEXT_EDITING=$<BOOL:${ENGINE_FEATURE_TEXT_EDITING}>
  )
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
  bindings/bindings.cpp
  src/engine.cpp
  src/engine/internal/engine_state.cpp
  # Command processing
  src/engine/command/commands.cpp
  src/engine/command/command_dispatch.cpp
  # Entity management
  src/engine/entity/entity_manager.cpp
  src/engine/entity/selection_manager.cpp
  # History (undo/redo)
  src/engine/history/history_manager.cpp
  # Rendering
  src/engine/render/render.cpp
  src/engine/render/vector_tessellation.cpp
  # Interaction (picking, transforms)
  src/engine/interaction/pick_system.cpp
  src/engine/interaction/snap_solver.cpp
  src/engine/interaction/interaction_session.cpp
  src/engine/interaction/interaction_session_begin.cpp
  src/engine/interaction/interaction_session_update.cpp
  src/engine/interaction/interaction_session_side_resize.cpp
  src/engine/interaction/interaction_log.cpp
  # Persistence
  src/engine/persistence/snapshot.cpp
  src/engine/persistence/snapshot_build.cpp
  # Implementation (CadEngine method implementations)
  src/engine/impl/engine_upsert.cpp
  src/engine/impl/engine_digest.cpp
  src/engine/impl/engine_style.cpp
  src/engine/impl/engine_query.cpp
  src/engine/impl/engine_selection_handle.cpp
  src/engine/impl/engine_side_handle.cpp
  src/engine/impl/engine_overlay.cpp
  src/engine/impl/engine_text.cpp
  src/engine/impl/engine_snapshot.cpp
  src/engine/impl/engine_render.cpp
  src/engine/impl/engine_event.cpp
)

if(ENGINE_FEATURE_ROTATE)
  list(APPEND ENGINE_SOURCES
    src/engine/interaction/interaction_session_rotate.cpp
  )
else()
  list(APPEND ENGINE_SOURCES
    src/engine/interaction/interaction_session_rotate_stub.cpp
  )
endif()

if(ENGINE_FEATURE_DRAFT)
  list(APPEND ENGINE_SOURCES
    src/engine/interaction/interaction_draft.cpp
  )
else()
  list(APPEND ENGINE_SOURCES
    src/engine/interaction/interaction_draft_stub.cpp
  )
endif()

  # Text module sources (conditional)
if(ENGINE_ENABLE_TEXT)
  list(APPEND ENGINE_SOURCES
    src/engine/text/text_store.cpp
    src/engine/text/font_manager.cpp
    src/engine/text/text_layout.cpp
    src/engine/text/text_shaping.cpp
    src/engine/text/text_caret.cpp
    src/engine/text/text_selection_rects.cpp
    src/engine/text/text_navigation.cpp
    src/engine/text/atlas_packer.cpp
    src/engine/text/glyph_atlas.cpp
    src/engine/text_system.cpp
  )
endif()

# --- WASM Build Configuration (Emscripten) ---
if(EMSCRIPTEN)
  set(OUTPUT_DIR "${OUTPUT_DIR}" CACHE PATH "Output directory for wasm artifacts")
  if(NOT OUTPUT_DIR)
    set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/dist/wasm")
  endif()

  # Relative override handling:
  # - if prefixed with source dir name (e.g. engine-extracted/dist/wasm), resolve from source parent
  # - otherwise resolve from source dir
  if(NOT IS_ABSOLUTE "${OUTPUT_DIR}")
    get_filename_component(_source_basename "${CMAKE_SOURCE_DIR}" NAME)
    if(OUTPUT_DIR MATCHES "^${_source_basename}(/|$)")
      set(_output_base "${CMAKE_SOURCE_DIR}/..")
    else()
      set(_output_base "${CMAKE_SOURCE_DIR}")
    endif()
    get_filename_component(OUTPUT_DIR "${OUTPUT_DIR}" ABSOLUTE BASE_DIR "${_output_base}")
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
  
  target_include_directories(
    engine
    PRIVATE
      ${CMAKE_CURRENT_SOURCE_DIR}/src
      ${CMAKE_CURRENT_SOURCE_DIR}
      ${CMAKE_CURRENT_SOURCE_DIR}/include
  )
  engine_enable_warnings(engine)
  engine_enable_logging(engine)
  engine_enable_sanitizers(engine)
  engine_apply_feature_definitions(engine)
  
  # Link text dependencies if enabled
  if(ENGINE_ENABLE_TEXT)
    target_link_libraries(engine PRIVATE freetype harfbuzz msdfgen::msdfgen)
    target_include_directories(engine PRIVATE 
      ${freetype_SOURCE_DIR}/include
      ${harfbuzz_SOURCE_DIR}/src
      ${msdfgen_SOURCE_DIR}
      ${CMAKE_CURRENT_SOURCE_DIR}/src/msdfgen_config
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
  if(ENGINE_PROFILE_MINIMAL_2D)
    set(TEST_SOURCES
      tests/commands_test.cpp
      tests/snapshot_test.cpp
      tests/selection_order_test.cpp
      tests/protocol_info_test.cpp
      tests/minimal_profile_test.cpp
    )
    if(ENGINE_ENABLE_TEXT)
      list(APPEND TEST_SOURCES
        tests/text_commands_upsert_test.cpp
      )
    endif()
  else()
    set(TEST_SOURCES
      tests/engine_core_test.cpp
      tests/engine_transform_test.cpp
      tests/engine_draft_test.cpp
      tests/engine_pick_test.cpp
      tests/engine_snap_test.cpp
      tests/engine_handles_test.cpp
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
      tests/text_commands_upsert_test.cpp
      tests/text_commands_edit_test.cpp
      tests/text_commands_style_test.cpp
      tests/text_commands_regression_test.cpp
        tests/text_coordinate_system_test.cpp
      )
    endif()
  endif()

  # Add test executable
  add_executable(engine_tests ${TEST_SOURCES})
  
  # Link engine sources and gtest
  target_link_libraries(
    engine_tests
    PRIVATE GTest::gtest_main
  )
  target_include_directories(
    engine_tests
    PRIVATE
      ${CMAKE_CURRENT_SOURCE_DIR}/src
      ${CMAKE_CURRENT_SOURCE_DIR}
      ${CMAKE_CURRENT_SOURCE_DIR}/include
  )
  engine_enable_warnings(engine_tests)
  engine_enable_logging(engine_tests)
  engine_enable_sanitizers(engine_tests)
  engine_apply_feature_definitions(engine_tests)
  
  # Link text dependencies if enabled
  if(ENGINE_ENABLE_TEXT)
    target_link_libraries(engine_tests PRIVATE freetype harfbuzz msdfgen::msdfgen)
    target_include_directories(engine_tests PRIVATE 
      ${freetype_SOURCE_DIR}/include
      ${harfbuzz_SOURCE_DIR}/src
      ${msdfgen_SOURCE_DIR}
      ${CMAKE_CURRENT_SOURCE_DIR}/src/msdfgen_config
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
