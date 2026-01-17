# Frontend Agents Guide (`apps/web`)

## Core Responsibilities
- **UI State Only**: Handle interactions, panels, and viewports.
- **Engine Delegation**: All geometry/CAD logic MUST be delegated to `engine/` facades.
- **Design Fidelity**: Strictly follow `design/tokens.css` and Tailwind classes.

## Commands
- **Dev Server**: `pnpm dev`
- **Test**: `pnpm test`
- **Lint**: `pnpm lint`
- **Typecheck**: `pnpm typecheck`
- **Build**: `pnpm build`

## Architecture Rules
1. **No CAD Math in JS**: Do not calculate intersections, snapping, or geometry in TypeScript. Ask the Engine.
2. **Hot Path Safety**: `pointermove` handlers must use `usePickThrottle` or similar optimizations. Never allocate objects in these handlers.
3. **Component Structure**:
   - `components/`: Generic UI atoms (Buttons, Inputs).
   - `features/`: Domain-specific logic (Editor, Settings).
   - `engine/`: The ONLY place that imports `wasm`.

## State Management
- Use **Zustand** for UI state (isModalOpen, activeTool).
- **NEVER** store the CAD document in Zustand. It lives in C++ memory.
