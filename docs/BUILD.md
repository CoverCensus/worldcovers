# Building WorldCovers

## Prerequisites

- Python 3.13+
- Node.js + npm (for the frontend build)
- MySQL 8+
- `pipenv` (`pip install pipenv`)

## Steps

### 1. Install Python dependencies

```sh
pipenv install --dev
```

### 2. Configure the database

Copy the example credentials file and fill in your MySQL details:

```sh
cp mysql.cnf.example mysql.cnf
```

Edit `mysql.cnf` with your database user and password. Django reads this file at startup via `read_default_file` — **`migrate` will fail without it**.

```ini
[client]
user = your_db_user
password = your_db_password
default-character-set = utf8mb4
```

`mysql.cnf` is gitignored. To create the database and user from scratch, see `tools/setup_worldcovers_db.sql`.

### 3. Build the frontend

The React SPA must be built before Django can serve it:

```sh
cd frontend && npm ci && npm run build
```

This creates `frontend/dist/`, which the Django dev server serves via the catch-all route at the site root. No separate frontend dev server is needed for normal use.

### 4. Run migrations

```sh
pipenv run manage migrate
```

### 5. Collect static files

```sh
pipenv run manage collectstatic --noinput
```

### 6. Start the dev server

```sh
pipenv run manage runserver
```

The built SPA is served at `/`. The API lives under `/api/` and the admin at `/admin/`.

## Seeding and ETL

For importing catalog data and running ETL pipelines, see [docs/TOOLS.md](TOOLS.md).

## Deployment

For deploying to staging/production, see [docs/DEPLOY.md](DEPLOY.md).
