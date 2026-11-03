# Deploy IssueFlow on Render + Supabase

The repository is prepared for one **free Render web service** and a **free Supabase PostgreSQL database**. Render serves the built Next.js frontend and FastAPI from the same HTTPS address. Login stays username/password only. Profile photos stay in PostgreSQL.

## 1. Create the Supabase database

1. Open [Supabase](https://supabase.com/dashboard) and create a project on a **Free** organization.
2. Give it a name such as `issueflow`. Generate and save its **database password**.
3. Wait for provisioning, then click **Connect** at the top of the project dashboard.
4. Select the **Session pooler** connection string, on port **5432**. Use this IPv4-compatible option rather than the transaction pooler or an IPv6-only direct address.
5. Replace the password placeholder with your Supabase **database password**, URL-encoding reserved characters if needed. This is separate from your IssueFlow sign-in password.
6. Make sure the connection string includes `sslmode=require`. Append `?sslmode=require` if there are no existing query parameters, or `&sslmode=require` if there are.

Save that complete string for Render's `DATABASE_URL`. Keep it private.

You do not need to paste SQL, create Supabase Auth users, or copy Supabase API keys. First startup creates the app's tables and configured account in a private schema named `issueflow`. Leave that schema out of Supabase's **exposed schemas**; the app accesses it only through FastAPI's database connection. If this project only serves IssueFlow, you can also disable the Data API in Supabase's Data API settings.

Reference: [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres), [Data API access controls](https://supabase.com/docs/guides/api/securing-your-api).

## 2. Put the prepared source on GitHub

Render must be able to read the source from GitHub. This workspace currently has no usable Git remote.

Use a **private repository** if you prefer. Create it with a README, clone it to a normal writable folder, and copy the project source there. Alternatively, extract the prepared deployment source ZIP into the clone. Keep `render.yaml`, `.python-version`, `backend/`, `frontend/`, and `scripts/` at the repository root.

```sh
git clone https://github.com/YOUR_USERNAME/IssueFlow.git IssueFlow-hosted
cd IssueFlow-hosted
# Copy/extract the prepared source into this folder, then:
git add .
git commit -m "Prepare IssueFlow for Render and Supabase"
git push
```

The deployment ZIP excludes secrets, local database files, dependencies, and build caches. When copying directly from the original folder, also exclude `.env`, `.env.local`, `.data/`, `.venv/`, `node_modules/`, `.next/`, and `out/`. The included `.gitignore` covers these paths. Retain the lockfiles and `frontend/public/fonts/`.

## 3. Deploy the Render Blueprint

1. Open the [Render Dashboard](https://dashboard.render.com/).
2. Choose **New → Blueprint**, connect GitHub, and select your repository.
3. Use the branch containing the prepared files and the Blueprint path **`render.yaml`**.
4. Confirm the service uses the **Free** compute plan. The Blueprint creates one web service, with no Render database or paid disk.
5. Enter these two secret values when prompted:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The complete Supabase **Session pooler** connection string from step 1 |
| `AUTH_PASSWORD_HASH` | The existing hash from your local `backend/.env`, without the surrounding quotes |

To generate a fresh hash instead, run this locally and enter the password you want to use:

```sh
cd backend
uv run python -m app.manage hash-password
```

Copy only the generated `scrypt$...` value into Render. Keep the hash private. It creates the first account; changing this environment variable later does not reset an existing database account's password.

6. Review and apply the Blueprint. Render builds the frontend, installs the Python dependencies, and starts the server. Watch the service's deployment logs until it is **Live**.

The Blueprint supplies the remaining configuration:

| Setting | Configured value |
| --- | --- |
| Runtime | Python |
| Compute plan | Free |
| Root directory | Repository root; leave the Dashboard root-directory field blank |
| Build command | `bash scripts/render-build.sh` |
| Start command | `bash scripts/render-start.sh` |
| Health check | `/health` |
| `DATABASE_SCHEMA` | `issueflow` |
| `AUTH_USERNAME` | `susybegula` |
| `COOKIE_SECURE` | `true` |
| `CORS_ORIGINS` | `[]`; the app adds Render's own address automatically |

The frontend build uses the same origin for `/api` calls. Do not set its API address to `localhost` for deployment. `start.sh` is the local launcher; Render uses the separate commands above.

Reference: [Render Blueprints](https://render.com/docs/blueprint-spec), [environment variables](https://render.com/docs/configure-environment-variables).

## 4. Verify the deployed app

1. Open the HTTPS `onrender.com` URL shown by Render.
2. Open `/health` at that address. It should return `{"status":"ok","database":"postgresql"}`.
3. Sign in as `susybegula` using the password corresponding to your hash.
4. Create a project, refresh, and confirm it persists. Check profile photo upload and theme switching.
5. In Supabase's Table Editor, select the **`issueflow` schema** to inspect the app's records.

The first deployment starts with an empty online workspace. Existing local projects, issues, and profile photos are **not uploaded automatically**; your local database is preserved. Moving existing local records is a separate data migration.

## Free-plan behavior and troubleshooting

- **Slow first visit:** Render Free sleeps after 15 minutes of inactivity and can take about a minute to wake. [Render free limits](https://render.com/docs/free)
- **Database unavailable after inactivity:** Supabase Free pauses after a week of inactivity. Restore the project in its dashboard. [Supabase pricing](https://supabase.com/pricing)
- **Connection errors:** Check that Supabase is running, the URL uses the **session pooler on 5432**, the database password is correct and properly URL-encoded, and SSL is enabled.
- **Missing build script or frontend export:** Check that Render's root directory is blank and all source folders were pushed. Use the supplied build/start commands.
- **Sign-in rejected:** Check `AUTH_USERNAME` and the password used to generate the hash. Render's database password is unrelated to app sign-in.
- **Origin rejected on a custom domain:** Add that exact HTTPS origin to `CORS_ORIGINS`, for example `["https://issues.example.com"]`, then deploy the changed environment. Render's default address remains allowed automatically.

The repository changes were tested locally. Your Supabase connection and Render deployment must still be verified after you enter the account-specific secrets and deploy.
