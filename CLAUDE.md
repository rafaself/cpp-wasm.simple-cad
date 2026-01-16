# Claude Code Project Configuration

## Project Overview

EletroCad WebApp - A CAD application built with React, TypeScript, and a WASM engine.

## Commit Convention

**All commits MUST follow Conventional Commits format:**

```
<type>(<scope>): <description>

[optional body]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### Types
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting (no logic changes)
- `refactor` - Code restructuring
- `perf` - Performance improvement
- `test` - Tests
- `build` - Build/deps
- `ci` - CI/CD
- `chore` - Maintenance

### Scopes
`ui`, `engine`, `api`, `editor`, `settings`, `theme`, `ribbon`, `layers`, `snap`, `docs`, `deps`

### Examples
```
feat(ui): add Tooltip component
fix(engine): resolve snap calculation error
refactor(theme): standardize surface tokens
perf(editor): throttle mouse position updates
docs(api): update setSnapOptions signature
```

## Code Standards

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utils: `camelCase.ts`
- Tests: `*.test.tsx`

### Prohibited Patterns
- No `.js` files in source (only `.ts`/`.tsx`)
- No hardcoded z-index values (use `--z-*` tokens)
- No hardcoded colors (use design tokens)
- No `bg-surface1` (use `bg-surface-1` with hyphen)

### Design Tokens
```css
/* Surfaces */
--color-surface-1, --color-surface-2

/* Z-Index */
--z-canvas-base, --z-canvas-overlay, --z-canvas-hud
--z-modal, --z-dropdown, --z-tooltip, --z-toast
```

### Tailwind Classes
```
bg-surface-1, bg-surface-2 (NOT bg-surface1)
z-canvas-hud, z-modal, z-tooltip
text-text, text-text-muted
```

## Key Directories

```
apps/web/
├── components/ui/      # Reusable UI components
├── features/editor/    # Editor-specific features
├── engine/core/        # WASM engine bindings
├── stores/             # Zustand stores
├── theme/              # Design tokens (tokens.css)
└── docs/               # Documentation
```

## Important Files

- `theme/tokens.css` - CSS custom properties
- `tailwind.config.cjs` - Tailwind configuration
- `engine/core/EngineRuntime.ts` - Engine API
- `docs/COMMIT_CONVENTION.md` - Full commit guide
