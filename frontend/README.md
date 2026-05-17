# Frontend (React)

This app is served by Django at **https://hellowoco.app**.

## Local development

### Option A: One-command launcher (recommended)
From the project root: `./run.sh`. With `DEBUG=True` (the default) this starts both the Vite dev server (HMR, on :8080) and Django (on :8000) in the same terminal; Ctrl+C kills both. Open **http://localhost:8080/**.

### Option B: Vite dev server + Django manually
1. Terminal A, from the project root: `woco runserver` (Django on :8000).
2. Terminal B, from `frontend/`: `npm i && npm run dev` (Vite on :8080).
3. Open **http://localhost:8080/**. Vite proxies `/api`, `/admin`, `/accounts`, `/media`, `/static` to Django (see `vite.config.ts`).

### Option C: Django serves the built frontend (production-like)
Set `DEBUG=False` in `.env` and run `./run.sh`. It builds `frontend/dist/` and starts Django on **http://127.0.0.1:8000/**. Use this to sanity-check the production bundle before pushing.

## Build
From `frontend/`: `npm run build`.
The compiled output is `frontend/dist/` (not committed). Deploys must build this folder before starting Django.

## Tech stack
- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
