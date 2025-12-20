# UI 100% “bugada” após início do WASM/C++ — investigação e correções

## Problema

Após o início da integração WASM/C++ (engine via Emscripten + viewer R3F), a UI passou a “não renderizar corretamente” (menus, canvas, headers etc).

O comportamento observado no código indica dois cenários que **parecem iguais para o usuário** (“tela quebrada”), mas têm causas diferentes:

1) A app está rodando no modo `engine=next` e **não renderiza** a UI antiga (Header/Ribbon/Sidebar), pois o `next` hoje monta apenas o `CadViewer`.
2) A UI até renderiza, mas fica **totalmente sem estilos** quando o Tailwind via CDN não carrega (rede bloqueada/offline ou COOP/COEP habilitado), dando a impressão de “renderização quebrada”.

Além disso, há um ponto crítico: o loader do WASM, do jeito que está no código, depende de uma variável global no `index.html`. Se essa variável não estiver presente, o `next` falha e fica preso numa tela de erro sem fallback automático para `legacy`.

## Plano de investigação (executado)

- Inspecionar o “entrypoint” de UI e o caminho `legacy` vs `next`.
- Mapear como o módulo WASM é carregado (Emscripten ES module + `engine.wasm`).
- Validar dependências de CSS/layout e impacto de COOP/COEP (SharedArrayBuffer).
- Rodar validações locais (Vitest / TypeScript) para detectar erros sistêmicos.

## Achados (com evidências no repo)

### 1) O `App` deixou de montar a UI “completa” e passou a montar um host de engine

- `frontend/App.tsx` agora renderiza apenas `CadSurfaceHost`.
- `frontend/src/components/CadSurfaceHost.tsx` escolhe entre:
  - `legacy`: `LegacySurface` (que inclui Header/Ribbon/Sidebar/Canvas2D)
  - `next`: `CadSurfaceNext` → `CadViewer` (full-screen, sem o resto da UI)

Impacto:
- Se o usuário estiver com `engine=next` (por querystring ou localStorage), **menus/header/sidebar somem**, pois não fazem parte do `next` hoje.

Como isso acontece na prática:
- O backend inicial vem de `frontend/src/engineBackend.ts`:
  - query param `?engine=legacy|next`
  - localStorage `engineBackend`
  - fallback padrão: `legacy`

### 2) O loader do WASM depende de `window.__cadEngineFactoryPromise` (e o fallback não dispara)

- `frontend/wasm/getCadEngineFactory.ts` exige `window.__cadEngineFactoryPromise` “setado no index.html”.
- Se a variável não existir, o carregamento falha com:
  - `WASM engine loader is missing: expected window.__cadEngineFactoryPromise`

Impacto na UI:
- Em `engine=next`, o `CadViewer` cai em `status=error` e renderiza apenas um `<div>Error: ...</div>`.
- O `ErrorBoundary` do `CadSurfaceHost` **não aciona o fallback** para `legacy`, porque o erro é tratado via estado (try/catch no `useEffect`) e não é “throw” durante render.

Resultado: o usuário fica preso no “next quebrado”, sem voltar automaticamente para a UI `legacy`.

### 3) Tailwind via CDN é um ponto único de falha (especialmente com COOP/COEP)

- O layout todo usa classes Tailwind (ex.: `bg-slate-900`, `flex`, `h-screen`, etc).
- Não há Tailwind instalado/bundleado no projeto (`frontend/package.json` não contém `tailwindcss`).
- Logo, **a UI depende do script externo** `https://cdn.tailwindcss.com` (`frontend/index.html`).

Por que isso “piora depois do WASM”:
- Para WASM com threads/SharedArrayBuffer, costuma-se habilitar **cross-origin isolation** (COOP/COEP).
- O repo já tem suporte: `frontend/vite.config.ts` pode injetar headers:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- Com COEP `require-corp`, recursos cross-origin podem ser bloqueados se não forem CORS/corp-correct.

Sintoma típico no browser (DevTools):
- `Refused to load the script ... because it violates the following Content Security Policy...`
- ou erro relacionado a COEP/COOP ao carregar o Tailwind CDN.

Quando o Tailwind não carrega:
- A UI “existe”, mas fica **sem estilo/layout** → parece “100% bugada”.

### 4) O `CadViewer` assume full-screen (`100vh`) e captura eventos no container

Em `frontend/src/components/CadViewer.tsx`, o root do viewer usa:
- `height: '100vh'`
- handlers no container (`onWheel`, `onPointerDown/Move/Up`)

Impacto:
- Mesmo depois de integrar o `next` na UI existente (Header/Ribbon/Sidebar), será necessário ajustar o viewer para **ocupar somente a área do canvas** (ex.: `height: 100%`), evitando overflow e bloqueio de interação do header.

## Verificações executadas

- `cd frontend && npm test`
  - Resultado: **1 teste falhando** (`tests/undoRedo.spec.ts`), restante ok.
  - Isso não explica a UI “sem render”, mas indica regressão paralela no store/undo/redo.
- `cd frontend && npx tsc -p tsconfig.json --noEmit`
  - Resultado: existem **erros de TypeScript** em componentes do editor/import.
  - Vite normalmente não bloqueia `dev` por typecheck; ainda assim isso pode quebrar CI/build se houver gate.

## Diagnóstico provável (ordem de probabilidade)

1) Você está abrindo a app com `?engine=next` (ou `engineBackend=next` no localStorage), e o `next` não inclui menus/headers/sidebar → “UI sumiu/quebrou”.
2) O loader do WASM não está corretamente inicializado (variável global ausente ou erro de path/base), e o `next` fica em “Error: ...” sem fallback para `legacy`.
3) Tailwind CDN não está carregando (rede/COOP+COEP), deixando toda a UI “sem layout”.

## Como confirmar em 2 minutos (checklist)

1) Na URL, force `legacy`: `http://localhost:3000/?engine=legacy`
2) Se voltar ao normal: o problema é “modo next”/migração incompleta, não o editor em si.
3) Se ainda estiver quebrado/sem estilo:
   - Abra DevTools → Network → procure `cdn.tailwindcss.com`
   - Abra DevTools → Console → procure erros de COEP/COOP/CSP
4) Para o WASM:
   - Em `engine=next`, veja se o erro é “missing __cadEngineFactoryPromise” ou falha ao buscar `wasm/engine.wasm`.

## O que falta / como corrigir (priorizado)

### P0 — Recuperar a UI imediatamente

- Garanta um “escape hatch” para o usuário:
  - Documentar `?engine=legacy`
  - Botão/flag visível para alternar engine (o `DevBadge` já existe), e/ou limpar `localStorage.engineBackend`

### P0 — Fallback automático quando o `next` falhar

- Fazer o `next` cair automaticamente para `legacy` quando:
  - o loader global não existir
  - o `engine.wasm` não carregar
  - a inicialização do módulo falhar

Hoje o `ErrorBoundary` não captura falhas tratadas via estado. Precisa de um mecanismo de “fatal error” que dispare o fallback.

### P0 — Tornar o carregamento do WASM robusto

Escolher **um** caminho:

- Opção A (simples e explícita): inicializar `window.__cadEngineFactoryPromise` no `frontend/index.html` e manter o contrato do `getCadEngineFactory`.
- Opção B (mais limpa para Vite): remover a dependência global e fazer o loader em TS via `import(/* @vite-ignore */ url)` apontando para `BASE_URL + 'wasm/engine.js'`.

Em ambos os casos:
- Validar `BASE_URL` (deploy em subpath) e o path final do `engine.wasm`.

### P1 — Parar de depender de Tailwind CDN (especialmente se COOP/COEP estiver ligado)

- Instalar Tailwind no build (tailwindcss + postcss + autoprefixer), gerar CSS local e remover `<script src="https://cdn.tailwindcss.com">`.
- Isso elimina:
  - dependência de rede
  - fragilidade com COEP/COOP
  - variação de estilos entre ambientes

### P1 — Integrar `CadViewer` dentro do layout existente

Para o `next` não “matar” menus/headers/sidebar:
- Reutilizar o layout de `LegacySurface` (Header/Ribbon/Sidebar/Modals)
- Substituir apenas o “canvas area”:
  - `EditorCanvas` → `CadViewer`
- Ajustar `CadViewer` para `height: 100%` (não `100vh`) e manter eventos limitados ao canvas.

## Arquivos relevantes

- `frontend/App.tsx`
- `frontend/src/components/CadSurfaceHost.tsx`
- `frontend/src/components/LegacySurface.tsx`
- `frontend/src/components/CadViewer.tsx`
- `frontend/src/engineBackend.ts`
- `frontend/wasm/getCadEngineFactory.ts`
- `frontend/index.html`
- `frontend/vite.config.ts`

## Risco (se aplicar as correções)

- **Baixo** para fallback automático + ajuste de layout (mudança localizada, sem alterar o engine).
- **Médio** para migrar Tailwind CDN → build local (mexe em toolchain/CSS pipeline; precisa validar visual).
- **Baixo/Médio** para alterar o loader do WASM (risco de path/base em deploy; mitigável com testes/preview).

## Próximos passos sugeridos (se você autorizar implementação)

1) Implementar fallback automático do `next` → `legacy` em caso de erro de init.
2) Consolidar o loader do WASM (remover dependência frágil do global, ou garantir que o `index.html` injete o Promise corretamente).
3) Criar `NextSurface` com o layout completo e embutir o `CadViewer` na área do canvas (sem `100vh`).
4) (Opcional, recomendado) Migrar Tailwind para build local para compatibilidade com COOP/COEP e ambientes sem rede.

