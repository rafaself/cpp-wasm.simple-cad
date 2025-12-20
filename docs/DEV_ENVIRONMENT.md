# Dev Environment (Windows/Docker) - Supported Setup

This project uses a high-churn toolchain (Vite + esbuild + WASM builds). On Windows, running inside OneDrive-managed folders can cause `EPERM` when spawning native binaries (common symptom: Vite fails to load `vite.config.ts` with `Error: spawn EPERM`).

## Supported options (pick one)

### Option A (recommended on Windows): move repo out of OneDrive

1) Move the repository to a non-OneDrive path, for example:
- `C:\dev\EndeavourCanvas\`

2) Install dependencies and run:
```bash
cd frontend
npm install
npm run dev
```

If you still hit `spawn EPERM`, check Windows Defender / Controlled Folder Access allowlists.

### Option B (recommended for reproducibility): develop inside Docker

This repository includes a full-stack dev Docker setup:

```bash
docker compose up
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:8000

Notes:
- Dependencies are installed inside the containers and persisted via named volumes.
- File changes are bind-mounted from your host into the containers.

## WASM build (C++ -> WebAssembly)

The WASM builder is a build job container (not a server). Run it on demand:

```bash
cd frontend
npm run build:wasm
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
2) Use the Docker dev environment (`docker compose up`).
3) Allowlist/disable Controlled Folder Access for your dev toolchain (advanced; company policy may block).
