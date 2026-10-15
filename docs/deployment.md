# Deployment runbook

## 1. Railway PostgreSQL

Use the existing `desirable-acceptance` project and Postgres service. Apply migrations from a trusted machine with its Railway connection string:

```bash
DATABASE_URL='postgresql://…' npx prisma migrate deploy
DATABASE_URL='postgresql://…' npm run db:seed
DATABASE_URL='postgresql://…' npm run db:import:web
```

Vercel cannot reach Railway private DNS. Enable Railway's Postgres TCP proxy/public networking, copy the external `DATABASE_URL`, and rotate credentials according to the Railway account policy.

## 2. Trigger.dev

The configured project ref is `proj_arshoohyphgefpqxzivf`. Configure the production values used by tasks (`DATABASE_URL`, AI Gateway, and Cloudinary variables), then run `npm run trigger:deploy`. Copy the production `TRIGGER_SECRET_KEY` into Vercel. A dry-run build does not deploy tasks.

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
