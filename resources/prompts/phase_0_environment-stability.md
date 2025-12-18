# Prompt — Fase 0: Estabilização do Ambiente (Bloqueador)

**Role:** Atue como **DevOps Engineer** e **Tooling Engineer (Windows/Docker/Vite)**.

**Contexto:**

- O projeto está migrando para uma arquitetura com **C++/WASM** e futuro WebGL/R3F.
- O time reportou “tela branca” e falhas ao rodar o frontend em Windows.
- Há histórico de erro: `Error: spawn EPERM` ao carregar `frontend/vite.config.ts` (Vite/esbuild) em ambiente Windows/OneDrive/Controlled Folder Access.

**Referências (source of truth):**

- `AGENTS.md`
- `wasm-migration-plan.md`
- `wasm-migration-backlog.md`

## Objetivo

Tornar o ambiente de desenvolvimento **reprodutível e estável**, garantindo que:

- o frontend sobe sem erro,
- build/test rodam,
- o pipeline de build do WASM funciona,
  antes de qualquer refatoração de engine/render.

## Escopo (o que você PODE fazer)

- Ajustes em documentação (`README.md`, `docs/*`).
- Ajustes em scripts (`frontend/package.json`) para robustez.
- Ajustes em Docker (`docker-compose.yml`, `Dockerfile.*`) se necessário.

## Fora de escopo

- Refatorar o editor/engine de desenho.
- Alterar comportamento do produto além de melhorias de dev tooling.

## Tarefas

1. **Diagnóstico do ambiente**

- Confirmar se o repo está dentro do OneDrive.
- Confirmar se o dev local sofre `spawn EPERM` (Vite/esbuild).

2. **Definir “ambiente oficial” suportado**
   Escolha e documente **pelo menos 1** caminho suportado:

- (A) Dev local Windows fora do OneDrive (recomendado), ou
- (B) Dev 100% via Docker Compose (recomendado).

3. **Robustez dos scripts**

- Garantir que `npm run build:wasm` funcione no PowerShell:
  - preferir `docker.exe` explicitamente no script para evitar problemas de resolução do comando.
- Garantir que o README explique que `wasm-builder` é job e finaliza ao terminar.

4. **Checklist de recuperação**

- Adicionar seção “Troubleshooting: tela branca / esbuild EPERM” com passos concretos.

## Critérios de sucesso (Gates)

- `docker compose up` sobe frontend e backend.
- `cd frontend && npm run test` executa.
- `cd frontend && npm run build:wasm` gera `frontend/public/wasm/engine.js` e `engine.wasm`.
- Se o modo “local Windows” for suportado: `cd frontend && npm run dev` sobe sem `spawn EPERM`.

## Output esperado

- Lista de mudanças feitas (arquivos alterados).
- Instruções mínimas (3–6 passos) para rodar em ambiente suportado.
