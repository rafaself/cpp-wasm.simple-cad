# Dev Environment (Windows/Docker) - Supported Setup

This project uses a high-churn toolchain (Vite + esbuild + WASM builds). On Windows, running inside OneDrive-managed folders can cause `EPERM` when spawning native binaries (common symptom: Vite fails to load `vite.config.ts` with `Error: spawn EPERM`).

## Supported options (pick one)

### Option A (recommended on Windows): move repo out of OneDrive

1) Move the repository to a non-OneDrive path, for example:
- `C:\dev\EndeavourCanvas\`

2) Install dependencies and run:
```bash
cd frontend
pnpm install
pnpm dev
```

If you still hit `spawn EPERM`, check Windows Defender / Controlled Folder Access allowlists.

### Option B (recommended for reproducibility): develop inside Docker

There is **no** full-stack dockerized environment (database, backend, frontend) currently shipped for local development.
The included `docker-compose.yml` is strictly a helper for the WASM build process.

To build the C++ engine to `frontend/public/wasm/` using Docker:

```bash
# Using the Makefile helper:
make wasm

# Or directly via pnpm:
cd frontend
pnpm build:wasm
```

## WASM build (C++ -> WebAssembly)

The WASM builder is a build job container (not a server). Run it on demand:

```bash
cd frontend
pnpm build:wasm
```

Expected output:
- `frontend/public/wasm/engine.js`
- `frontend/public/wasm/engine.wasm`

## Troubleshooting

### Error: spawn EPERM (Vite/esbuild) on Windows

Typical causes:
- repo inside OneDrive folder
- Windows Defender / Controlled Folder Access blocking process execution

Fixes:
1) Move repo out of OneDrive (best fix).
2) Build WASM via Docker (`cd frontend && pnpm build:wasm`).
3) Allowlist/disable Controlled Folder Access for your dev toolchain (advanced; company policy may block).
