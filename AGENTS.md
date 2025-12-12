# Alsogravity Monorepo

This project has been refactored into a Monorepo structure with a Modular Monolith architecture.

## Principles:

- Always consider SRP (Single Responsibility Principle) for modules, files, functions, classes, etc.
- Always delete referenceres (imports, variables, etc) that is not being used or useful for the context.

## Structure

- **`frontend/`**: Contains the React/Vite frontend application.
- **`backend/`**: Contains the FastAPI backend application.

## Getting Started

### Backend (FastAPI)

- The API will be available at `http://localhost:8000`.

### Frontend (React)

- Usually, the application will be available at `http://localhost:3000` (or the port shown in the terminal).