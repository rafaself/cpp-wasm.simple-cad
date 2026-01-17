# Commit Convention

This project follows **Conventional Commits** specification for all commits.

## Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

## Types

| Type       | Description                                      |
|------------|--------------------------------------------------|
| `feat`     | New feature                                      |
| `fix`      | Bug fix                                          |
| `docs`     | Documentation changes                            |
| `style`    | Code style (formatting, whitespace, no logic)    |
| `refactor` | Code refactoring (no feature or fix)             |
| `perf`     | Performance improvement                          |
| `test`     | Adding or updating tests                         |
| `build`    | Build system or external dependencies            |
| `ci`       | CI/CD configuration                              |
| `chore`    | Maintenance tasks                                |

## Scopes

| Scope      | Description                                      |
|------------|--------------------------------------------------|
| `ui`       | UI components (buttons, dialogs, etc.)           |
| `engine`   | WASM engine and runtime                          |
| `api`      | API layer and data fetching                      |
| `editor`   | Editor features (canvas, tools, interactions)    |
| `settings` | Settings and preferences                         |
| `theme`    | Theming, colors, design tokens                   |
| `docs`     | Documentation files                              |
| `deps`     | Dependencies                                     |
| `ribbon`   | Ribbon UI components                             |
| `layers`   | Layer management                                 |
| `snap`     | Snapping functionality                           |

## Examples

```bash
# Features
feat(ui): add tooltip component with positioning
feat(editor): implement polygon tool
feat(theme): add surface-1/surface-2 tokens

# Fixes
fix(engine): resolve memory leak in render loop
fix(ribbon): correct button hover states
fix(snap): fix grid alignment calculation

# Refactoring
refactor(editor): simplify layer management logic
refactor(ui): extract Button primitives

# Performance
perf(engine): throttle mouse position updates

# Documentation
docs(api): update setSnapOptions signature
docs: add commit convention guide

# Style
style(ui): apply consistent spacing tokens

# Chores
chore(deps): update lucide-react to v0.556
chore: clean stale .js artifacts
```

## Rules

1. **First line max 72 characters**
2. **Use imperative mood**: "add" not "added" or "adds"
3. **No period at the end** of the description
4. **Lowercase** type and scope
5. **Scope is optional** but recommended

## AI Agent Commits

When commits are made by AI agents, include the co-author footer:

```
feat(design): standardize color tokens

Refactored surface tokens to follow Tailwind convention:
- surface1 → surface-1
- surface2 → surface-2

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### AI Agent Guidelines

1. Always use conventional commit format
2. Include `Co-Authored-By` footer
3. Keep description concise but descriptive
4. Use body for additional context when needed
5. Reference issues if applicable: `Fixes #123`

## Setup

Install the commit-msg hook to enforce this convention:

```bash
./scripts/setup-hooks.sh
```

## Validation

The commit-msg hook will reject commits that don't follow the format:

```
ERROR: Commit message does not follow conventional commit format.

Expected format: <type>(<scope>): <description>
```
