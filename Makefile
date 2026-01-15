
FRONTEND_DIR := apps/web
CPP_DIR := packages/engine
CPP_BUILD_DIR := packages/engine/build_test
PNPM := pnpm --dir $(FRONTEND_DIR)
DC := docker compose

.PHONY: fbuild up install test test-view wasm build dev all ctest ctest-clean checks bundle-report

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

bundle-report:
	$(PNPM) bundle:report

dev:
	$(PNPM) dev

checks:
	$(PNPM) typecheck
	$(PNPM) lint
	$(PNPM) format:check
	$(PNPM) test
	$(PNPM) build
	$(PNPM) governance:check

test-view:
	cd $(FRONTEND_DIR) && npx vite preview --outDir coverage --port 4173

# C++ engine tests
ctest:
	@mkdir -p $(CPP_BUILD_DIR)
	@cd $(CPP_BUILD_DIR) && cmake .. -DCMAKE_BUILD_TYPE=Debug
	@cd $(CPP_BUILD_DIR) && make -j$$(nproc) engine_tests
	@cd $(CPP_BUILD_DIR) && ctest --output-on-failure

ctest-clean:
	@rm -rf $(CPP_BUILD_DIR)

all: install wasm build

# Default target
.DEFAULT_GOAL := all
