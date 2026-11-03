# IssueFlow frontend

Next.js, React, and TypeScript with a minimal glass-style light interface.

Set `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` in `.env.local`, then run:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. The local FastAPI backend and PostgreSQL server must be running; see the root README for startup commands.

Authentication uses an HTTP-only session cookie from FastAPI. There is one configured account, no registration, and no sample workspace. All workspace data is stored in local PostgreSQL. Fonts are served locally.

`npm run build` exports static assets into `out/`. The API URL is embedded at build time. No cloud API keys are required.
