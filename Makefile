FRONTEND_DIR := frontend

.PHONY: frontend-install frontend-test frontend-build-wasm frontend-build frontend-dev frontend-all

frontend-install:
	cd $(FRONTEND_DIR) && npm install

frontend-test:
	cd $(FRONTEND_DIR) && npx vitest run

frontend-build-wasm:
	cd $(FRONTEND_DIR) && npm run build:wasm

frontend-build:
	cd $(FRONTEND_DIR) && npm run build

frontend-dev:
	cd $(FRONTEND_DIR) && npm run dev

frontend-all: frontend-install frontend-build-wasm frontend-build

# Default target
.DEFAULT_GOAL := frontend-all

