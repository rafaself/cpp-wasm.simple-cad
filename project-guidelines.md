# ElectroCad Web - Project Guidelines & Architecture

This document serves as the single source of truth for the project's architecture, folder structure, and coding standards. **All future development and AI prompts must adhere to these constraints.**

---

## 1. Project Architecture (Feature-First)

We utilize a **Feature-Based Architecture**. This means code is organized by **business domain** (features) rather than technical type (controllers, views, etc.) wherever possible.

### Folder Structure Explained

```text
src/
├── assets/             # Static assets (images, SVGs) used globally.
├── components/         # GLOBAL "Dumb" Components (UI Kit).
│                       # (e.g., Button, Modal, Input, RibbonButton).
│                       # These components know NOTHING about business logic or Stores.
├── config/             # Global configuration, Constants, and Menu Definitions (JSON).
├── features/           # THE CORE. Independent modules of the application.
│   └── editor/         # Example Feature: The CAD Editor.
│       ├── components/ # Components specific ONLY to the Editor (Canvas, Sidebar).
│       ├── hooks/      # Business logic specific to the Editor.
│       ├── types/      # Types specific to the Editor.
│       └── index.ts    # Public API of the feature (optional).
├── hooks/              # Global reusable hooks (e.g., useWindowSize, useTheme).
├── layouts/            # Page wrappers (e.g., MainLayout with Header/Footer).
├── pages/              # Route entry points. Composes Features into a Page.
├── stores/             # Global State Management (Zustand).
├── types/              # Global TypeScript Definitions (shared across features).
└── utils/              # Pure functions (Math, Geometry, Formatters).
```

---

## 2. Constraints & Best Practices

### A. Component hierarchy
1.  **Global vs. Feature:** If a component is used in *more than one feature*, it goes to `src/components`. If it is unique to a feature, it goes to `src/features/{featureName}/components`.
2.  **Dumb vs. Smart:**
    *   **UI Components (`src/components`)** must be "Dumb". They receive data via `props` and emit events via callbacks. They **never** import the Store directly.
    *   **Feature Components** can be "Smart". They can connect to the Zustand store.

### B. State Management (Zustand)
1.  **Centralized Logic:** State mutations (addNode, addWall) should live inside `src/stores` actions, not inside React components.
2.  **Atomic Selectors:** When using `useStore`, select only the specific state you need to prevent unnecessary re-renders.

### C. Menu & Configuration
1.  **Data-Driven UI:** The Top Ribbon and Menus are generated dynamically from `src/config/menu.ts`.
2.  **Modifying Menus:** To add a button, edit the JSON in `config/menu.ts`, not the JSX in `Ribbon.tsx`.
3.  **Icons:** Icons are mapped via string keys in `src/utils/iconMap.ts`. Do not import Lucide icons directly into components that read from the Menu JSON; use the `IconMap`.

### D. Styling (Tailwind CSS)
1.  **Utility First:** Use Tailwind utility classes directly in JSX (`className`).
2.  **Consistency:** Use the color constants defined in `src/config/constants.ts` (e.g., `COLOR_WALL`, `COLOR_SELECTION`) for Canvas rendering logic, and Tailwind classes for HTML UI.
3.  **Layouts:** Use Flexbox and Grid for layouts. Avoid absolute positioning unless creating overlays or canvas elements.

### E. TypeScript
1.  **Strict Typing:** No `any`. Define interfaces in `src/types/index.ts` (if global) or locally within the feature.
2.  **Props Interface:** Every component must have a defined Props interface.

---

## 3. Workflow for New Features

When asked to implement a new feature (e.g., "Add a Layer Manager"):

1.  **Analyze Scope:** Is it global or part of an existing feature?
    *   *If specific:* Add to `src/features/editor/components`.
    *   *If new domain:* Create `src/features/layers/`.
2.  **Define Types:** Update `src/types/index.ts` with new data structures.
3.  **Update Store:** Add state slices and actions to `src/stores/useAppStore.ts`.
4.  **Create Logic/UI:** Implement components.
5.  **Register:** If it's a tool/action, register it in `src/config/menu.ts`.

---

## 4. Instructions for Future AI Prompts

If you are an AI assistant reading this, follow these rules when generating code:

1.  **Check Existing Structure:** Do not create duplicate files. Check `src/features` first.
2.  **Respect the Monolith Store (Current Status):** Currently, `useAppStore.ts` is a monolithic store. Keep it that way unless asked to slice it.
3.  **JSON Menus:** If the user asks to "Add a button", generate the change for `src/config/menu.ts`.
4.  **Geometry:** Use helpers in `src/utils/geometry.ts` for math calculations.
5.  **Output Format:** Always return changes in the XML format `<changes><change>...</change></changes>`.

---

## 5. Technology Stack

*   **Framework:** React 19
*   **Build Tool:** Vite
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS
*   **Icons:** Lucide React
*   **State:** Zustand
*   **UUID:** uuid (v4)