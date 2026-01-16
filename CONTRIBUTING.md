# Contributing to EletroCAD WebApp

## Development Workflow

1.  **Fork and Clone**: Fork the repository and clone it locally.
2.  **Install Dependencies**: Run `pnpm install`.
3.  **Start Development Server**: Run `pnpm dev`.
4.  **Run Governance Checks**: Before committing, ensure your code passes all governance checks.

## UI Design & Governance

We enforce strict UI design guidelines to maintain consistency and performance. Please review `DESIGN.md` for detailed specifications.

### UI Compliance Checklist

Before submitting a PR, please ensure your changes meet the following criteria:

#### BLOCKER (Build fails)
- [ ] No arbitrary Tailwind values (`z-[...]`, `text-[...px]`, `gap-[...]`)
- [ ] No hex in UI styles (`bg-[#...]`, className with hex for layout/borders)
- [ ] Passes `pnpm governance:arbitrary`
- [ ] Passes `pnpm governance:hex-ui` (if applicable)

#### Required
- [ ] Uses UI primitives from `components/ui/**` (or adds a new primitive)
- [ ] Uses tokens only (no hex, no arbitrary Tailwind)
- [ ] Uses semantic z-index tokens
- [ ] Has keyboard + focus behavior
- [ ] Has ARIA where applicable
- [ ] Does not add hot-path renders or allocations
- [ ] Updates DESIGN.md if a new pattern is introduced

#### Allowed (WARN)
- [ ] Tailwind scale values (`z-50`, `gap-3`) only if in migration allowlist
- [ ] Hex in data contexts uses `data-color` attribute or ColorPicker components
