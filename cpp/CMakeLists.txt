# Main source files for the WASM engine (engine core + extracted modules)
set(ENGINE_SOURCES
  engine/bindings.cpp
  engine.cpp
  engine/commands.cpp
  engine/snapshot.cpp
  engine/render.cpp
  engine/vector_tessellation.cpp
  engine/entity_manager.cpp
)

# Text module sources (conditional)
if(ENGINE_ENABLE_TEXT)
  list(APPEND ENGINE_SOURCES
    engine/text/text_store.cpp
    engine/text/font_manager.cpp
    engine/text/text_layout.cpp
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
  
  # Link text dependencies if enabled
  if(ENGINE_ENABLE_TEXT)
    target_link_libraries(engine PRIVATE freetype harfbuzz msdfgen::msdfgen)
    target_include_directories(engine PRIVATE 
      ${freetype_SOURCE_DIR}/include
      ${harfbuzz_SOURCE_DIR}/src
      ${msdfgen_SOURCE_DIR}
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
    tests/vector_tessellation_test.cpp
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
  
  # Link text dependencies if enabled
  if(ENGINE_ENABLE_TEXT)
    target_link_libraries(engine_tests PRIVATE freetype harfbuzz msdfgen::msdfgen)
    target_include_directories(engine_tests PRIVATE 
      ${freetype_SOURCE_DIR}/include
      ${harfbuzz_SOURCE_DIR}/src
      ${msdfgen_SOURCE_DIR}
    )
  endif()

  # Include engine implementation (as a library-like component)
  target_sources(engine_tests PRIVATE ${ENGINE_SOURCES})

  # Add test to CTest
  include(GoogleTest)
  gtest_discover_tests(engine_tests)
endif()
