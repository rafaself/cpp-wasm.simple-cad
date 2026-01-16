### Description

<!-- Describe your changes here -->

### UI Compliance Checklist

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
