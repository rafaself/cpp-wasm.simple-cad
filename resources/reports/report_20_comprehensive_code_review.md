# Code Review: ProtonCanvas / EndeavourCanvas

**Date:** 2025-05-21 (Assumed)
**Reviewer:** Jules (Senior Software Engineer / Context Engineer)
**Compliance:** Based on `AGENTS.md` and `frontend/project-guidelines.md`

---

## A) Executive Summary

**Overall Rating:** ⚠️ **Risk / Parcial**

The **ProtonCanvas** repository is in a critical transitional state. While it possesses strong foundational documentation (`AGENTS.md`) and a clear vision for a high-performance CAD engine, the implementation suffers from a fractured architecture and significant technical debt in critical paths.

**Top 5 Risks:**
1.  **Hybrid Architecture:** The codebase is split between a legacy Feature-Based structure (`frontend/features`) and a new "NextSurface" structure (`frontend/src/next`), creating confusion and code duplication risks.
2.  **Supply Chain Security:** The PDF import feature fetches executable code (`pdf.worker.min.mjs`) from a public CDN (`unpkg.com`) at runtime, posing a critical security and availability risk.
3.  **Fragile Import Logic:** The DXF and PDF importers (`dxfToShapes.ts`, `pdfToShapes.ts`) are monolithic, untyped (`any`), and contain complex geometry logic that is hard to test and prone to regression.
4.  **Lack of Quality Gates:** The project lacks standard linting (`eslint`), formatting (`prettier`), and strict type-checking scripts in `package.json`, allowing technical debt to accumulate invisible to CI.
5.  **State Management Leakage:** Domain logic (geometry calculations) is leaking into UI stores (`useDataStore.ts`), violating the separation of concerns mandated by `AGENTS.md`.

**Top Recommendations:**
1.  **Secure Dependencies:** Bundle the PDF worker locally immediately.
2.  **Unify Architecture:** Commit to moving all features to `frontend/src/features` (or `frontend/features` if that's the choice) and deprecate the other.
3.  **Enforce Quality:** Implement `eslint`, `prettier`, and a `tsc --noEmit` check in the pre-commit or CI pipeline.

**"If I could only change 3 things..."**
1.  Bundle `pdf.worker` (Security).
2.  Add `pnpm typecheck` and `pnpm lint` scripts (Quality).
3.  Refactor `dxfToShapes.ts` to reduce `any` usage and cyclomatic complexity (Maintainability).

---

## B) Compliance com AGENTS.md

| Diretriz | Status | Evidência / Recomendação |
| :--- | :---: | :--- |
| **10_engineering-principles** | ⚠️ | `dxfToShapes.ts` usa muitos `as any`. **Rec:** Adotar tipagem estrita para entidades DXF. |
| **20_architecture-rules** | ⚠️ | Lógica de domínio (ex: `alignSelected`) dentro de `useDataStore`. **Rec:** Mover para `frontend/utils/geometry.ts`. |
| **30_frontend-react** | ⚠️ | Estrutura de pastas inconsistente (`src` vs `features`). **Rec:** Seguir `project-guidelines.md` rigorosamente ou atualizá-lo. |
| **70_security-review** | ❌ | Dependência externa (CDN) para código executável (Worker). **Rec:** Self-host do worker. |
| **Reporting** | ✅ | Relatório salvo em `resources/reports/`. |

---

## C) Achados por Categoria

### 1. Segurança: PDF Worker via CDN
- **Categoria:** Segurança
- **Severidade:** Crítico
- **Prioridade:** P0
- **Onde:** `frontend/features/import/usePlanImport.ts`
- **Contexto:** `pdfjs.GlobalWorkerOptions.workerSrc = ...unpkg.com...`
- **Impacto:** Se o unpkg cair ou for comprometido, a importação de PDF para (DoS) ou executa código malicioso (XSS/RCE).
- **Recomendação:** Instalar o worker como asset local ou usar o import do vite.
- **Correção:**
  ```typescript
  import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  ```

### 2. Arquitetura: Estrutura Híbrida (Legacy vs Next)
- **Categoria:** Arquitetura
- **Severidade:** Alto
- **Prioridade:** P1
- **Onde:** `frontend/features` vs `frontend/src`
- **Contexto:** O `project-guidelines.md` diz `src/features`, mas o código está em `frontend/features`.
- **Impacto:** Novos devs não sabem onde colocar código. Duplicação de utilitários.
- **Recomendação:** Mover tudo para `frontend/src/features` conforme a documentação, ou atualizar a doc.

### 3. Qualidade de Código: DXF Import "God Function"
- **Categoria:** Código
- **Severidade:** Médio
- **Prioridade:** P2
- **Onde:** `frontend/features/import/utils/dxf/dxfToShapes.ts`
- **Contexto:** Função gigante com `any` casts e mutação de estado.
- **Impacto:** Altíssima chance de regressão ao adicionar suporte a novas entidades.
- **Recomendação:** Quebrar em `processText`, `processInsert`, etc. Remover `any`.

### 4. DX: Falta de Lint/Typecheck
- **Categoria:** DX
- **Severidade:** Médio
- **Prioridade:** P1
- **Onde:** `frontend/package.json`
- **Contexto:** Não há scripts `lint` ou `typecheck`.
- **Impacto:** Erros de tipo e estilo inconsistente entram no repo facilmente.
- **Recomendação:** Adicionar `eslint` e scripts npm.

### 5. Arquitetura: Lógica de Domínio na Store
- **Categoria:** Arquitetura
- **Severidade:** Baixo
- **Prioridade:** P2
- **Onde:** `frontend/stores/useDataStore.ts`
- **Contexto:** `alignSelected` e `rotateSelected` calculam geometria dentro do store.
- **Impacto:** Dificulta testes unitários isolados da geometria e incha o store.
- **Recomendação:** Extrair para `TransformationService` ou funções puras em `utils`.

---

## D) Plano de Ação (PRs Sugeridos)

### PR #1 (P0): Security Hardening & Env Stability
**Título:** `chore: bundle pdf worker and add quality scripts`
**Objetivo:** Remover dependência do unpkg e adicionar scripts de verificação.
**Passos:**
1. Configurar `pdfjs-dist` worker com Vite URL import.
2. Adicionar script `"typecheck": "tsc --noEmit"` ao `package.json`.
3. (Opcional) Adicionar eslint básico.
**Testes:** Verificar importação de PDF offline. Rodar `pnpm typecheck`.

### PR #2 (P1): Architecture Unification
**Título:** `refactor: move features to src/features`
**Objetivo:** Alinhar código com `project-guidelines.md`.
**Passos:**
1. Mover `frontend/features/*` para `frontend/src/features/*`.
2. Atualizar imports.
3. Atualizar `frontend/tsconfig.json` se necessário.
**Testes:** Rodar build e testes existentes (`pnpm test`).

### PR #3 (P2): DXF Import Refactor
**Título:** `refactor: modularize dxf import logic`
**Objetivo:** Melhorar manutenibilidade do importador.
**Passos:**
1. Criar `frontend/features/import/utils/dxf/parsers/`
2. Extrair `parseText`, `parseInsert` para arquivos separados.
3. Substituir `any` por tipos do `dxf-parser`.
**Testes:** Adicionar testes de snapshot para cada tipo de entidade.

---

## E) Backlog de Melhorias

- **Performance:** Implementar `Web Worker` também para o parsing de PDF (hoje bloqueia UI?).
- **Testes:** Aumentar cobertura de testes unitários em `useDataStore`.
- **Docs:** Atualizar `README.md` raiz para remover referências antigas.
- **Security:** Implementar CSP (Content Security Policy) headers no servidor.
