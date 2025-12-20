
FRONTEND_DIR := frontend
NPM := npm --prefix $(FRONTEND_DIR)
DC := docker compose

.PHONY: fbuild up install test wasm build dev all

fbuild:
	$(DC) up && $(NPM) install && $(NPM) run build:wasm && $(NPM) run build

up:
	$(DC) up

install:
	$(NPM) install

test:
	$(NPM) run test

wasm:
	$(NPM) run build:wasm

build:
	$(NPM) run build

dev:
	$(NPM) run dev

all: install wasm build

# Default target
.DEFAULT_GOAL := all

