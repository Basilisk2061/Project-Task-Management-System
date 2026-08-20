# TaskFlow

TaskFlow is a web-based project and task management system. The current version
provides a small React frontend, a FastAPI backend, and six related SQLAlchemy
models backed by SQLite.

## Technology stack

- Frontend: React, Vite, Bootstrap 5, Axios
- Backend: FastAPI, SQLAlchemy, SQLite

The database contains users, projects, project members, tasks, comments, and
document metadata. Tables are created automatically when FastAPI starts.

## Backend setup

From the project root:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`. Check it at
`http://127.0.0.1:8000/api/health`.

## Frontend setup

In a second terminal, from the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`.

Configuration defaults are documented in the `.env.example` files. Copy an
example to `.env` only when you need to override a default.
