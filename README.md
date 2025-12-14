# EndeavourCanvas

EndeavourCanvas is a modern, web-based CAD application specialized for residential electrical engineering projects. It combines a robust 2D drafting engine with domain-specific features for electrical design, offering a seamless experience from layout to calculation.

## 🚀 Features

*   **2D CAD Engine:** Full-featured canvas with Cartesian coordinate system, supporting lines, polylines, arcs, circles, and rectangles.
*   **Electrical Domain:** Dedicated tools and symbols for low-power electrical projects (residential).
*   **Smart Snapping:** Intelligent snapping to grid, object vertices, midpoints, and connection points.
*   **Layer Management:** Advanced layer system with "ByLayer" properties, locking, and visibility controls, inspired by AutoCAD and Figma.
*   **Interactive UI:** Modern, dark-themed interface with command-line support and ribbon navigation.
*   **Localization:** The User Interface is designed for Portuguese (pt-BR) users.

## 🛠️ Tech Stack

### Frontend
*   **Framework:** React 19
*   **Build Tool:** Vite
*   **Language:** TypeScript
*   **State Management:** Zustand (Split stores: Data, UI, Settings, Library)
*   **Styling:** Tailwind CSS (via CDN)
*   **Icons:** Lucide React

### Backend
*   **Framework:** FastAPI
*   **Language:** Python 3.11+
*   **Validation:** Pydantic
*   **Testing:** Pytest

## 📂 Project Structure

```text
.
├── backend/            # FastAPI application
│   ├── app/            # Application logic and domain modules
│   └── tests/          # Backend tests
├── frontend/           # React application
│   ├── src/
│   │   ├── features/   # Feature-based modules (editor, diagram, library)
│   │   ├── stores/     # Zustand state stores
│   │   ├── components/ # Shared UI components
│   │   └── utils/      # Geometry and helper functions
│   └── ...
└── ...
```

## 🏁 Getting Started

### Prerequisites

*   **Node.js** (Latest LTS recommended)
*   **pnpm** (Package manager)
*   **Python 3.11+**

### Backend Setup

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```

2.  Create and activate a virtual environment:
    ```bash
    python -m venv venv
    # Linux/macOS:
    source venv/bin/activate
    # Windows:
    .\venv\Scripts\activate
    ```

3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

4.  Run the server:
    ```bash
    uvicorn app.main:app --reload
    ```
    The API will be available at `http://localhost:8000`.

### Frontend Setup

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```

2.  Install dependencies:
    ```bash
    pnpm install
    ```

3.  **Configuration:**
    Create a `.env` file in the `frontend` directory with your API keys (if applicable):
    ```env
    GEMINI_API_KEY=your_api_key_here
    ```

4.  Run the development server:
    ```bash
    pnpm dev
    ```
    The application will be available at `http://localhost:3000`.

## 🧪 Testing

### Frontend
Run unit tests with Vitest:
```bash
cd frontend
pnpm test
```

### Backend
Run tests with Pytest:
```bash
cd backend
pytest
```

## 🤝 Contributing

This project follows strict architectural guidelines to ensure scalability and maintainability.

*   **Architecture:** Feature-Based Architecture.
*   **Language:** Codebase in English; UI in Portuguese (pt-BR).
*   **Guidelines:** Please refer to [`AGENTS.md`](AGENTS.md) and [`frontend/project-guidelines.md`](frontend/project-guidelines.md) before making changes.
