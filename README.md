# Beyond the Verse

AI-assisted Bible teaching production studio built with Next.js 16, Prisma, PostgreSQL, Trigger.dev, Vercel AI Gateway, Better Auth, and Cloudinary.

## Prerequisites

- Node.js 20+, npm 10+, and PostgreSQL 15+ (local or Railway)
- Trigger.dev, Cloudinary, and Vercel accounts
- Vercel AI Gateway model access for AI generation and transcription

## Local setup

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` and fill every value required for the feature you are testing.
3. Apply committed migrations: `npx prisma migrate deploy`.
4. Import the canon and Genesis 1 WEB fixture: `npm run db:seed`.
5. Start the web app: `npm run dev`.
6. In another terminal, start the durable task worker: `npm run trigger:dev`.
7. Open `http://localhost:3000`.

For deliberate offline UI development only, set `CONTENT_PROVIDER=development`. Production must use `CONTENT_PROVIDER=ai-gateway`.

## Create the first administrator

Set `ADMIN_EMAIL` to the only email allowed to register, then make this one-time request while the local app is running:

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"name":"Administrator","email":"admin@example.com","password":"replace-with-a-strong-unique-password"}'
```

Use the exact email configured in `ADMIN_EMAIL`. Other addresses are rejected. After bootstrap, use `/sign-in`; there is intentionally no public sign-up interface.

## Environment variables

- `DATABASE_URL`: PostgreSQL connection. Vercel needs Railway's externally reachable URL, not a `railway.internal` host.
- `BETTER_AUTH_SECRET`: at least 32 random characters; use a unique production secret.
- `BETTER_AUTH_URL`: `http://localhost:3000` locally and the canonical production URL on Vercel. Leave unset for previews.
- `ADMIN_EMAIL`: sole administrator registration allowlist.
- `CONTENT_PROVIDER`: `ai-gateway` in production or explicit `development` locally.
- `AI_GATEWAY_MODEL` and `AI_GATEWAY_API_KEY`: structured writing model and local/external credentials.
- `AI_TRANSCRIPTION_MODEL`: transcription-capable Gateway model.
- `AI_SPEECH_MODEL`, `TTS_VOICE`, `TTS_SPEED`, and `PRONUNCIATION_DICTIONARY`: scene narration configuration.
- `AI_IMAGE_MODEL`: scene visual generation model.
- `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY`, `TRIGGER_PUBLIC_API_KEY`: Trigger.dev project/runtime credentials.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`: authenticated media storage.

## Commands

- `npm run dev` — web development server
- `npm run trigger:dev` — Trigger.dev local worker
- `npm run build` — production web build
- `npm run trigger:deploy` — deploy Trigger.dev tasks
- `npm run lint` — lint source
- `npm run test` — unit tests
- `npx tsc --noEmit` — strict type check
- `npx prisma migrate deploy` — apply committed migrations
- `npm run db:seed` — seed canon, chapter records, and Genesis 1 WEB text

## Deployment topology

- Vercel: Next.js web/API application, deployed from Git pushes.
- Railway: PostgreSQL only.
- Trigger.dev Cloud: durable generation/transcription jobs.
- Cloudinary: authenticated source and generated media assets.
- Dedicated render worker: required for Remotion/FFmpeg; not yet implemented or deployed.

No Vercel Marketplace database/storage integration is needed. See [architecture and status](docs/architecture.md) and [deployment runbook](docs/deployment.md).
