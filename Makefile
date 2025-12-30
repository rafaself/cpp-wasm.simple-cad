
FRONTEND_DIR := frontend
CPP_DIR := cpp
CPP_BUILD_DIR := cpp_build_test
PNPM := pnpm --dir $(FRONTEND_DIR)
DC := docker compose

.PHONY: fbuild up install test wasm build dev all ctest ctest-clean checks

fbuild:
	$(PNPM) install --frozen-lockfile
	$(PNPM) build:wasm
	$(PNPM) build

up:
	$(DC) run --rm wasm-builder

install:
	$(PNPM) install --frozen-lockfile

test:
	$(PNPM) test

wasm:
	$(PNPM) build:wasm

build:
	$(PNPM) build

dev:
	$(PNPM) dev

checks:
	$(PNPM) typecheck
	$(PNPM) lint
	$(PNPM) format:check
	$(PNPM) test
	$(PNPM) build
	$(PNPM) governance:check

# C++ engine tests
ctest:
	@mkdir -p $(CPP_BUILD_DIR)
	@cd $(CPP_BUILD_DIR) && cmake ../$(CPP_DIR) -DCMAKE_BUILD_TYPE=Debug
	@cd $(CPP_BUILD_DIR) && make -j$$(nproc) engine_tests
	@cd $(CPP_BUILD_DIR) && ctest --output-on-failure

ctest-clean:
	@rm -rf $(CPP_BUILD_DIR)

all: install wasm build

# Default target
.DEFAULT_GOAL := all
