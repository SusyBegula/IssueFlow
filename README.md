# IssueFlow

A local project and issue tracker built with Next.js, React, TypeScript, FastAPI, and PostgreSQL. It runs without a cloud account or API keys. The interface is a minimal, glass-style light workspace.

For hosting, follow [Deploy on Render + Supabase](docs/deploy-render-supabase.md). The included `render.yaml` builds the frontend and serves it alongside FastAPI on one free Render web service, using Supabase PostgreSQL. Local startup remains available below.

## Start the app

Use Node.js 22+ and Python 3.12+ with [uv](https://docs.astral.sh/uv/). Dependencies are downloaded once; normal operation, authentication, data storage, and fonts work offline.

The local environment files in this checkout are already configured. Your existing username and password are retained; only a salted password hash is stored. There is no registration screen or sample workspace.

Start everything from the project root with:

```sh
./start.sh
```

Or run `npm start`. The launcher installs missing dependencies, starts PostgreSQL and FastAPI, waits for the API health check, then starts the frontend at **http://127.0.0.1:3000**. Keep this terminal open and press **Ctrl+C** to stop all three services cleanly. Existing database files are preserved. Once dependencies are installed, startup works offline.

If a required port is already in use, the launcher reports it and leaves the existing service alone. To use a database you have already started, run `./start.sh --external-db`; the launcher will start and stop only the API and frontend.

Optional ports: `./start.sh --port 3001 --api-port 8001`. Run `./start.sh --help` for all options.

To run the services individually instead:

**Terminal 1 — PostgreSQL**, from the project root:

```sh
npm ci
npm run db:start
```

This uses project-local PostgreSQL binaries; no Docker, administrator access, or system service is required. Keep this terminal open. Database files persist in `.data/postgres/`. Ctrl+C stops the server without deleting data.

**Terminal 2 — API:**

```sh
cd backend
uv sync --locked
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The API applies versioned SQL setup and creates the configured account on first startup. Subsequent startups preserve projects, issues, profiles, and the account password.

**Terminal 3 — frontend:**

```sh
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:3000** or **http://localhost:3000** and sign in as `susybegula` using your existing password. For local API URLs, the frontend automatically uses the same hostname as the page so the session cookie works with either address.

API documentation: `http://127.0.0.1:8000/docs`. Database health check: `http://127.0.0.1:8000/health`.

## Environment files

No Supabase configuration, email identity, JWT secret, publishable key, or service-role key is needed.

`frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

`backend/.env`:

```dotenv
DATABASE_URL=postgresql://issueflow:YOUR_DATABASE_PASSWORD@127.0.0.1:5433/issueflow
AUTH_USERNAME=susybegula
AUTH_PASSWORD_HASH='scrypt$YOUR_SALT$YOUR_HASH'
SESSION_HOURS=12
COOKIE_SECURE=false
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

The current ignored backend environment file already has a generated database password and a hash for your chosen account password. Do not replace it with these example placeholders. Database credentials are distinct from the application login password.

For a fresh checkout, copy the `.env.example` files, choose a database password, and generate the login hash with:

```sh
cd backend
uv sync --locked
uv run python -m app.manage hash-password
```

Paste the printed `AUTH_PASSWORD_HASH` assignment into `backend/.env`. Password entry is hidden. The configured hash is used only when the account does not exist yet.

To change the password for an existing account:

```sh
cd backend
uv run python -m app.manage set-password
```

This updates the database hash and revokes existing sessions. Changing `AUTH_PASSWORD_HASH` alone does not reset an existing account.

## Use an existing PostgreSQL installation

The bundled runner is optional. Create a local database and database role, set `DATABASE_URL` to its connection URL, then start the API and frontend. The API creates its tables automatically. Use a dedicated empty database for this app.

The runner binds only to `127.0.0.1`, defaults to port `5433`, and requires the username/password/port in `DATABASE_URL` to match the cluster's initialization settings. Once a cluster exists, PostgreSQL manages its database password; changing the environment file does not change that password.

## Authentication and access

- Passwords use salted scrypt hashes; plaintext passwords are not stored in the database or frontend.
- Sessions use random HTTP-only, SameSite=Strict cookies. Only a SHA-256 hash of each session token is stored in PostgreSQL.
- Logout removes the server session; expired sessions are rejected.
- The API permits only the configured username. There is no registration endpoint.
- Mutating browser requests are restricted to configured frontend origins. CORS allows credentials for those exact origins.
- Every project/issue operation checks project ownership or membership; assignments must be project participants. SQL is parameterized.
- PostgreSQL is private to the backend. The frontend never receives database credentials.

For HTTPS hosting later, set `COOKIE_SECURE=true` and use a frontend/API deployment on the same site (or proxy the API). The default setup is for this local machine.

## Features

Projects and issues support creation, editing, deletion, priorities, statuses, assignments, labels, and due dates. The app includes a Kanban board, list view, search, filters, sorting, overview, personal issues, and profile editing. All records persist in PostgreSQL.

Open your profile from the sidebar account or top-right avatar. You can edit your display name and avatar color, upload or remove a profile picture, and see your project and assigned-issue counts. JPG, PNG, and WebP photos up to 2 MB and 25 megapixels are accepted. The API crops photos to a square, resizes them to 256 × 256, and removes metadata before saving them in local PostgreSQL. No storage service or additional keys are required.

Use the sun/moon button in the top bar or sign-in screen to switch themes. **Profile → Appearance** also offers Light, Dark, and System. The selection is saved in this browser and applies before the page renders. Light remains the default; System follows your operating system's appearance.

After updating an already running checkout, stop the launcher with Ctrl+C and run `./start.sh` again. Startup synchronizes backend dependencies and applies database migrations while preserving existing data.

The membership schema remains available, and the configured account can assign issues to itself. Other database accounts cannot log into this single-account app.

## Tests

Start PostgreSQL with the additional isolated test database:

```sh
npm run db:test
```

In another terminal, from the project root:

```sh
npm run test:api -- -q
npm test --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
```

The API suite uses real PostgreSQL. Each test creates and removes a unique schema inside a dedicated database ending in `_test`, leaving the application's workspace untouched. It checks persistence, password verification, session revocation/expiry, authorization, assignment validation, transaction rollback, cascade deletion, CSRF origin checks, login throttling, and profile photo validation, storage, and removal.

## Data and backups

Keep `.data/postgres/` and `backend/.env` private; both are ignored by Git. Do not delete `.data/postgres/` unless you intend to erase the local cluster. Use PostgreSQL's `pg_dump`/`pg_restore` for live database backups, or copy the cluster directory only while the server is stopped. Dependencies can be reinstalled; database files hold your actual work.

## Layout

```text
scripts/database.mjs           Local PostgreSQL runner
backend/app/                  API, sessions, password hashing, database setup
backend/sql/001_initial.sql    Initial versioned schema
backend/sql/002_profile_photo.sql  Profile picture migration
backend/tests/                PostgreSQL integration tests
frontend/src/                 Next.js UI and cookie-authenticated API client
frontend/public/fonts/        Local fonts and license
.data/postgres/               Private database files (ignored)
```
