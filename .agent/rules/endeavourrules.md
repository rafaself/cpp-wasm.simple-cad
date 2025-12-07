---
trigger: always_on
---

## Tech Stack

- **Frontend:** React, Vite, TypeScript, TailwindCSS (Folder: /frontend)
- **Backend:** Python 3.11, FastAPI, Pydantic (Folder: /backend)
- **Architecture:** Monorepo.

## Project Goal

EndeavourCanvas is a Web App being build to be a tool to develop electrical projects of low power, as residences. Is being focused in design and canva features, and after about calculations.

## Critical Rules

1. **Context Awareness:** When I ask for a backend change, check if it breaks the frontend types.
2. **Modular Code:** Keep calculations in `backend/app/modules/engine`.
3. **No Placeholders:** Write complete code. If logic is missing, ask me, don't put "TODO".
4. **Language:** Everything in the code, except for what is displayed for the user, has to be in english. For the user, pt-BR.
5. Whenever creating a route in the Backend, create the corresponding TypeScript interface in the Frontend.
6. Do not use heavy graphics libraries without permission.
