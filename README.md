# EarthRe SLA Monitoring Dashboard

This implementation separates the application into the required runtime layers:

- Frontend: `code/frontend` (Next.js dashboard)
- Worker: `code/backend` (Cloudflare Worker ingestion API)

## Architecture

The application follows the required flow:

Next.js UI -> Cloudflare Worker -> PostgreSQL/Neon

Why these choices:

- Next.js gives the dashboard a strong React-based UI, server rendering support, and a straightforward deployment story on Vercel.
- Cloudflare Workers are stateless, easy to deploy, and a good fit for ingestion and validation logic without exposing database credentials to the browser.
- Neon PostgreSQL is a managed PostgreSQL service with a generous free tier and simple Drizzle integration, which aligns with the no-cost requirement.

## Local verification status

This environment did not include production Vercel, Cloudflare, or Neon credentials, so the live external deployment URLs were not verified in this session.

Local runtime checks did complete successfully:

- Worker health: `http://127.0.0.1:8787/health`
- Frontend: `http://localhost:3000`

The Worker does not keep an in-memory dataset. Uploads, observations, service records, upload metadata, dashboard statistics, and logs are read from PostgreSQL. Without `DATABASE_URL`, database-backed endpoints fail explicitly instead of silently falling back to process memory.

## Data findings from the supplied CSV

The actual source file, `monitoring_checks_9d_seed101.csv`, contains the following confirmed quality issues and dataset characteristics:

- 4,672 source rows
- 5 services: `auth-api`, `notify-worker`, `payments-api`, `reports-api`, `search-api`
- 2 monitoring agents: `agent-1`, `agent-2`
- Dataset window: `2025-05-08T00:00:00.000Z` -> `2025-05-16T23:45:00.000Z`
- 6 exact duplicate rows removed
- 56 missing latency values
- 1 negative latency value
- 1 non-standard status code `999`
- Mixed timestamp representations (ISO-8601 and Unix epoch seconds)
- Mixed latency units (milliseconds and seconds)
- Multiple agent observations for the same `(service, timestamp)` logical check
- 339 logical checks with multiple observations
- 4,320 expected logical checks for the dataset across the 5 services and 15-minute interval grid

## Assumptions and business rules

The implementation follows these explicit rules:

1. 2xx HTTP responses mean the service is available.
2. A logical check is defined as `(service, timestamp)`.
3. Multiple agents do not increase the SLA denominator; they share the same logical check slot.
4. A logical check is available if at least one agent reports a successful 2xx status.
5. Missing logical checks count as unavailable and are included in the denominator.
6. Exact duplicate source rows are removed before persistence.
7. Invalid or missing latency does not automatically make the check unavailable.
8. All timestamps are normalized and interpreted as UTC.
9. New uploads replace the currently active dataset and do not mix multiple uploads together.

These choices match the assignment requirements and ensure the SLA is calculated on logical monitoring checks rather than raw agent rows.

## Database schema and ingestion model

The worker is designed around the recommended separation between source observations and logical checks.

Key tables in the schema:

- `uploads`
- `services`
- `health_check_observations`

The worker keeps the ingestion flow separated into stages:

- CSV parsing
- schema validation
- normalization
- duplicate removal
- quality flagging
- persistence
- logical availability aggregation
- SLA calculation

The SQL migration is in `code/backend/migrations/0001_init.sql`. Apply it to the Neon database before uploading data.

## Data cleaning rules implemented

- ISO and Unix timestamps are converted to UTC timestamps.
- Latency is normalized into milliseconds.
- Missing latency becomes `NULL` and adds `MISSING_LATENCY` to `quality_flags`.
- Negative latency becomes `NULL` and adds `INVALID_LATENCY`.
- Status `999` is preserved as a raw integer and marked unavailable with `INVALID_STATUS`.
- Exact duplicates are dropped.
- Valid agent-level observations are retained even when multiple agents share a `(service, timestamp)` slot.

## SLA formula

The application uses the required formula:

Availability % = available logical checks / total expected logical checks * 100

The dashboard displays representative values with a sensible precision (for example 98.43%).

## API endpoints

- `POST /uploads`
- `GET /dashboard/stats`
- `GET /logs?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /health`

The front-end does not connect directly to PostgreSQL. It calls the Cloudflare Worker API instead.

## Environment variables

Required environment variables for local or deployment use:

Frontend:

- `NEXT_PUBLIC_WORKER_API_URL`

Worker:

- `DATABASE_URL`
- `ALLOWED_ORIGIN`

Database migration scripts are available in the backend workspace:

```powershell
cd "D:\Full Stack Case Study - EarthRe\code\backend"
npm run db:generate
npm run db:migrate
npm run db:check
```

Use `db:generate` after changing `src/schema.ts`, review the generated SQL, and use `db:migrate` to apply pending migrations to Neon. `db:push` is available for temporary development experiments but should not be used for production migration history.

Example files are provided in the project directories.

## Local setup

Run each application from its own directory. There is intentionally no root-level `package.json`; frontend and backend are deployed independently.

```bash
cd code/backend
npm install
npm run dev

cd ../frontend
npm install
npm run dev
```

Then open:

- Worker: http://127.0.0.1:8787/health
- Frontend: http://localhost:3000

To clear local Wrangler state after stopping `wrangler dev`, run from PowerShell:

```powershell
Remove-Item -LiteralPath .\backend\.wrangler -Recurse -Force
```

If Windows reports that files are in use, stop the terminal running `wrangler dev` first. If the lock remains, close VS Code terminals using the Worker and stop only the specific `node`, `wrangler`, or `workerd` process shown in Task Manager, then retry the command. `.wrangler` is disposable local emulator/cache state and is ignored by Git.

## Backend deployment: Cloudflare Workers

The backend is a Cloudflare Worker, not an AWS CloudFront distribution. CloudFront is AWS's CDN; use Cloudflare Workers/Wrangler for this repository's backend.

### 1. Install and authenticate Wrangler

From `code/backend`:

```powershell
npm install
npx wrangler login
npx wrangler whoami
```

The browser login must use the Cloudflare account where you want the Worker deployed.

### 2. Create or verify the Neon schema

Keep your local Neon connection string in `code/backend/.env`:

```env
DATABASE_URL=postgresql://...?...sslmode=require
```

Never commit this file. Then run:

```powershell
npm run db:check
npm run db:generate
npm run db:migrate
```

`db:migrate` applies pending migrations to the Neon database configured by `DATABASE_URL`. It does not deploy the Worker.

### 3. Configure local Worker variables

For local `wrangler dev`, copy `.dev.vars.example` to `.dev.vars` and set the same Neon URL:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```env
DATABASE_URL=postgresql://...?...sslmode=require
ALLOWED_ORIGIN=http://localhost:3000
```

`.env` is used by Drizzle commands. `.dev.vars` is used by Wrangler local development. Both are private and ignored by Git.

### 4. Add production Worker secrets

Run these commands from `code/backend`:

```powershell
npx wrangler secret put DATABASE_URL
npx wrangler secret put ALLOWED_ORIGIN
```

When prompted:

- For `DATABASE_URL`, paste the Neon connection string.
- For `ALLOWED_ORIGIN`, paste the deployed Vercel frontend URL, for example `https://your-app.vercel.app`.

Do not put `DATABASE_URL` in `wrangler.toml`, frontend environment variables, or any `NEXT_PUBLIC_*` variable.

### 5. Deploy the Worker

```powershell
npm run typecheck
npm run test
npm run deploy
```

Wrangler prints the deployed URL, usually similar to:

```text
https://earthre-sla-worker.<your-subdomain>.workers.dev
```

Verify it:

```powershell
curl.exe https://earthre-sla-worker.<your-subdomain>.workers.dev/health
```

Expected response:

```json
{"ok":true,"service":"earthre-sla-worker"}
```

Use this Worker URL as the frontend's `NEXT_PUBLIC_WORKER_API_URL`.

### 6. Deploy frontend after the Worker

In `code/frontend/.env.local` for local use:

```env
NEXT_PUBLIC_WORKER_API_URL=http://127.0.0.1:8787
```

For Vercel production, configure:

```text
NEXT_PUBLIC_WORKER_API_URL=https://earthre-sla-worker.<your-subdomain>.workers.dev
```

Then deploy the frontend independently using Vercel.

### Useful Worker commands

```powershell
npm run dev
npx wrangler deployments list
npx wrangler tail
npx wrangler deploy
```

If you change `ALLOWED_ORIGIN`, update the secret:

```powershell
npx wrangler secret put ALLOWED_ORIGIN
```

### Deployment order

1. Apply Neon migrations.
2. Deploy the Worker and verify `/health`.
3. Set the frontend's `NEXT_PUBLIC_WORKER_API_URL`.
4. Deploy the frontend.
5. Replace `ALLOWED_ORIGIN` with the exact Vercel URL.
6. Upload a CSV and verify `/dashboard/stats` and `/logs`.

## Production deployment notes

Because external platform credentials were not available in this environment, deployment was not verified live.

For production deployment, use:

```bash
cd code/backend
wrangler login
wrangler deploy

cd ../frontend
vercel login
vercel deploy
```

You should also configure the secret environment variables in the respective platforms and never commit `.env` or database secrets.

## Tests

The critical ingestion and SLA logic is covered by unit tests in `code/backend/src/lib/core.test.ts`.

## Limitations and future improvements

If more time were available, the following would be improved:

- stronger transactional database writes for upload replacement
- a dedicated PostgreSQL schema migration setup with Drizzle migrations
- richer charting and filtering in the Next.js UI
- deployment verification against real Vercel/Cloudflare/Neon accounts
- more complete integration tests for the worker upload path

## Summary

This repository contains a working local implementation of the requested architecture and core logic:

- Next.js frontend in `code/frontend`
- Cloudflare Worker ingestion API in `code/backend`
- typed data-cleaning and SLA logic in the worker layer
- date-filtered logs and collapsible statistics in the dashboard
- unit-tested business logic for timestamp conversion, latency cleanup, duplicate handling, and SLA calculation
