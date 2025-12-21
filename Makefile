
FRONTEND_DIR := frontend
PNPM := pnpm --dir $(FRONTEND_DIR)
DC := docker compose

.PHONY: fbuild up install test wasm build dev all

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

all: install wasm build

# Default target
.DEFAULT_GOAL := all
