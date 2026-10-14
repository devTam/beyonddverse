# Architecture

Beyond the Verse is a Next.js application backed by PostgreSQL and Prisma. The MVP is intentionally a modular monolith: UI, server actions, validation, and orchestration contracts live in one deployable web application, while expensive Remotion/FFmpeg work belongs on a separate worker.

## Implemented vertical slice

- 66-book Protestant canon and all 1,189 chapter records, with public-domain WEB text for Genesis 1
- immutable creator explanation revisions
- structured, Zod-validated content generation behind a provider interface
- Scripture citation report linked to the stored source text
- long-form and three short-form script records
- explicit human approval gate before media production
- idempotent workflow records and visible step history
- dashboard, Bible library, chapter studio, publication, analytics, and settings surfaces
- normalized Prisma models for assets, narration, renders, variants, publishing, analytics, costs, approvals, and audits

## Configuration blockers

The development provider is deterministic and clearly identified as such. These adapters require external credentials or approval before becoming operational:

- LLM, TTS, transcription, and image generation providers
- Cloudinary media storage, transformation, and signed delivery
- Trigger.dev durable jobs
- dedicated Remotion/FFmpeg rendering worker
- YouTube, Meta, TikTok, and X OAuth/publishing APIs
- analytics ingestion and Sentry

No integration is reported as live until its credentials and official platform approval exist.

## Invariants

- Scripture quotations come from the database, not model memory.
- Every generated package points to an immutable explanation revision.
- Every publish request uses a unique idempotency key.
- Platform failures are represented independently.
- Media binaries live in authenticated Cloudinary assets; PostgreSQL stores public IDs, dimensions, checksums, and provider metadata only.
- Scheduled timestamps are stored in UTC and accounts retain their display time zone.
