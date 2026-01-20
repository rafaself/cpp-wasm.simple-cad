# ADR-20260120: Standardize Ribbon Grammar + Tokens

## Context
- Ribbon controls were mixing segmented, bordered, and free-floating styles in the same row.
- Active tool and toggle states used the same visual cue.
- Ribbon-specific tokens lived in `apps/web/design/global.css`, outside the token source of truth.

## Decision
- Define ribbon tokens (sizing, spacing, and derived colors) in `apps/web/theme/tokens.css`.
- Introduce a single ribbon cluster grammar (`ribbon-cluster`) with an optional segmented variant.
- Separate active mode vs toggle-on styling via `ribbon-btn-mode` and `ribbon-btn-toggle-on`.
- Update ribbon controls (text formatting, colors/fill, layers, selection) to use the standardized components.

## Alternatives Considered
- Keep ribbon tokens in `apps/web/design/global.css` and continue using ad-hoc group styles.
- Use only segmented containers for all groups.

## Consequences
- Ribbon styles become consistent and token-driven across tabs.
- Toggle vs mode states are visually distinct and reusable.
- New ribbon UI must rely on the cluster grammar and tokenized sizes/colors.
