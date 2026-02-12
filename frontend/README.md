# Frontend (React)

This app is served by Django at **https://hellowoco.app**.

## Local development

### Option A: Django + built frontend (closest to production)
1. From `frontend/`: `npm i && npm run build` → creates `frontend/dist/`.
2. From project root: `python3.11 manage.py runserver`.
3. Open **http://127.0.0.1:8000/**.

### Option B: Vite dev server + Django API proxy
1. From `frontend/`: `npm i && npm run dev`.
2. Vite runs on **http://127.0.0.1:8080/** and proxies `/api`, `/admin`, `/accounts`, `/media`, `/static` to Django (see `vite.config.ts`).

## Build
From `frontend/`: `npm run build`.
The compiled output is `frontend/dist/` (not committed). Deploys must build this folder before starting Django.

## Tech stack
- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
