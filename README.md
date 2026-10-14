# Beyond the Verse

An AI-assisted Bible teaching production studio built with Next.js, Prisma, and PostgreSQL.

## Quick start

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Run `npm install`.
3. Run `npm run db:migrate` and `npm run db:seed`.
4. Run `npm run dev` and open `http://localhost:3000`.

The application ships with a deterministic development content provider. Set
`CONTENT_PROVIDER=openai` and provide `OPENAI_API_KEY` to use the OpenAI adapter.

## Commands

- `npm run dev` — start the web application
- `npm run build` — create a production build
- `npm run test` — run unit tests
- `npm run db:migrate` — apply Prisma migrations
- `npm run db:seed` — import the Genesis 1 MVP fixture

See `docs/architecture.md` for system boundaries and implementation status.

## Cloudinary media storage

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`
in `.env` to enable authenticated media uploads. Assets are organized beneath
`CLOUDINARY_FOLDER` and delivered through server-generated signed URLs.
