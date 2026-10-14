# Deployment runbook

## 1. Railway PostgreSQL

Use the existing `desirable-acceptance` project and Postgres service. Apply migrations from a trusted machine with its Railway connection string:

```bash
DATABASE_URL='postgresql://…' npx prisma migrate deploy
DATABASE_URL='postgresql://…' npm run db:seed
```

Vercel cannot reach Railway private DNS. Enable Railway's Postgres TCP proxy/public networking, copy the external `DATABASE_URL`, and rotate credentials according to the Railway account policy.

## 2. Trigger.dev

The configured project ref is `proj_arshoohyphgefpqxzivf`. Configure the production values used by tasks (`DATABASE_URL`, AI Gateway, and Cloudinary variables), then run `npm run trigger:deploy`. Copy the production `TRIGGER_SECRET_KEY` into Vercel. A dry-run build does not deploy tasks.

## 3. Vercel project

Authenticate/link once with `npx vercel login` and `npx vercel link`. Set `.env.example` variables for Production. Set `BETTER_AUTH_URL` to the production domain; omit it from Preview. Connect the GitHub repository and set Production Branch to `main`, so release deployment happens only by pushing a commit.

Use `npm install` as install command and `npm run build` as build command.

## 4. Dedicated render worker

Build `workers/render/Dockerfile` with repository root as its build context on a container host with at least 2 vCPU and 4 GB RAM. Set `DATABASE_URL`, the Cloudinary variables, and a strong `RENDER_WORKER_SECRET`. Expose HTTPS port 8080 through the host and set that origin as `RENDER_WORKER_URL` in Trigger.dev. The worker serializes renders by default to bound memory.

## 5. First production release

1. Apply Railway migrations and seed.
2. Deploy Trigger.dev tasks and confirm they are active.
3. Push the reviewed commit to `main`; let the Vercel Git integration deploy it.
4. Bootstrap the administrator through `/api/auth/sign-up/email` using the exact `ADMIN_EMAIL`.
5. Sign in and verify the Genesis 1 written-generation workflow.
6. Upload a short recording and verify transcription plus its Cloudinary asset.
7. Inspect Trigger.dev runs, PostgreSQL workflow rows, and Vercel logs.

## Current release limit

Do not advertise this deployment as the complete MVP yet. Narration, visuals, rendering, scheduling/publishing, and analytics are absent, as recorded in `docs/architecture.md`.
