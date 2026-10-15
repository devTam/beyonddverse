# Deployment runbook

## 1. Railway PostgreSQL

Use the existing `desirable-acceptance` project and Postgres service. Apply migrations from a trusted machine with its Railway connection string:

```bash
DATABASE_URL='postgresql://…' npx prisma migrate deploy
DATABASE_URL='postgresql://…' npm run db:seed
DATABASE_URL='postgresql://…' npm run db:import:web
```

Vercel uses Railway's TLS-enabled public TCP endpoint while Railway services use the private service URL. The production schema and the complete 31,098-verse WEB corpus have been imported.

## 2. Trigger.dev

The configured project ref is `proj_arshoohyphgefpqxzivf`; production version `20261015.1` is deployed. Trigger.dev still requires an `AI_GATEWAY_API_KEY` for real provider execution because Vercel OIDC is unavailable outside Vercel. Copy the production `TRIGGER_SECRET_KEY` into Vercel.

## 3. Vercel project

Link the GitHub repository to the intended Vercel team and set `.env.example` variables for Production. Set `BETTER_AUTH_URL` to the production domain. Connect the GitHub repository and set Production Branch to `main`, so release deployment happens only by pushing a commit. AI Gateway uses Vercel OIDC in deployments; use `AI_GATEWAY_API_KEY` only where OIDC is unavailable.

Use `npm install` as install command and `npm run build` as build command.

## 4. Dedicated render worker

The `render-worker` Railway service is declared in `.railway/railway.ts` and follows the repository’s `main` branch. Its `RAILWAY_DOCKERFILE_PATH` points to `workers/render/Dockerfile`; variables remain unmanaged so secrets never enter IaC. Use at least 2 vCPU and 4 GB RAM. Expose its HTTPS domain and set that origin as `RENDER_WORKER_URL` in Trigger.dev. `/health` reports process liveness and `/ready` checks PostgreSQL connectivity.

## 5. First production release

1. Apply Railway migrations and seed.
2. Deploy Trigger.dev tasks and confirm they are active.
3. Push the reviewed commit to `main`; let the Vercel Git integration deploy it.
4. Bootstrap the administrator through `/api/auth/sign-up/email` using the exact `ADMIN_EMAIL`.
5. Sign in and verify the Genesis 1 written-generation workflow.
6. Upload a short recording and verify transcription plus its Cloudinary asset.
7. Inspect Trigger.dev runs, PostgreSQL workflow rows, and Vercel logs.

## External approval gates

YouTube requires a Google OAuth application and authorized test account. Meta and TikTok publishing require their respective app products and may require external review. Keep YouTube uploads `unlisted` and TikTok uploads `SELF_ONLY` until acceptance testing is complete.

## PostgreSQL backup and restore drill

Use Railway's scheduled backups for normal recovery and retain an encrypted logical export before migrations. Never write database URLs into scripts or Git history.

```bash
pg_dump --format=custom --no-owner --no-acl "$SOURCE_DATABASE_URL" --file beyond-the-verse.dump
createdb "$DISPOSABLE_DATABASE_URL"
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DISPOSABLE_DATABASE_URL" beyond-the-verse.dump
DATABASE_URL="$DISPOSABLE_DATABASE_URL" npx prisma migrate status
psql "$DISPOSABLE_DATABASE_URL" -c 'select count(*) from bible_verses;'
```

The drill passes only when migrations are current, the verse count is 31,098, representative projects and workflow rows can be queried, and the disposable database is removed afterward. Production restore requires a maintenance window, a fresh pre-restore export, and post-restore `/ready` plus application smoke checks.
