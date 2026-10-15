# Architecture and implementation status

Beyond the Verse is currently a Next.js modular monolith backed by PostgreSQL/Prisma. Trigger.dev runs durable orchestration outside request handlers. Media lives in authenticated Cloudinary assets. Remotion/FFmpeg rendering will run on a dedicated worker, never in Vercel Functions.

## Implemented and verified

- Better Auth administrator login, database sessions, route proxy, server-side mutation authorization, and administrator email allowlist
- 66-book Protestant canon and all 1,189 chapter records; public-domain WEB text for Genesis 1
- immutable written explanations plus browser recording/audio upload with authenticated direct Cloudinary upload
- durable Trigger.dev audio transcription that retains the original asset and creates an immutable transcript revision
- durable Trigger.dev Scripture preparation, structured content generation, reference validation, and persistence pipeline
- Vercel AI Gateway structured generation with Zod validation; deterministic provider only when explicitly selected for development
- long-form and three short-form script persistence, scene records, source traceability, and human script approval gate
- workflow/run/step state persisted in PostgreSQL and live progress polling in the studio
- Cloudinary signed uploads, response verification, authenticated delivery URLs, deletion, and media metadata
- editable scripts/scenes, immutable linked revisions, history navigation, reject/reopen actions, and latest-revision-only approval
- approval-gated scene narration with configurable voice/speed/pronunciation, per-scene retries, and cross-revision cache reuse
- approval-gated scene visual generation with per-scene retries, prompt/model cache reuse, and asset provenance metadata
- shared Remotion 16:9/9:16 compositions, dedicated authenticated render worker, FFmpeg utilities, render reconciliation, and Cloudinary video output
- three separately approved short scripts with independent narration/visual generation and shared 9:16 platform masters
- database-backed final media approval, UTC scheduling, cancel/reschedule controls, and delayed manual-publishing fallback tasks
- complete 66-book WEB USFM source and deterministic 31,000+ verse importer
- encrypted OAuth connections and official YouTube, Instagram, and TikTok publisher adapters
- publication attempt history, remote reconciliation, official analytics collection, and analytics dashboards
- asset approval library, thumbnail generation, background-music selection, and generation budget enforcement
- Sentry instrumentation, database-backed authentication rate limiting, CSP/security headers, and worker readiness checks
- production web build, Trigger.dev bundle dry-run, strict type check, lint, unit tests, and auth HTTP behavior

## Not implemented yet

- visual revision comparison and one-click section regeneration
- word-level narration timings, FFmpeg normalization, playback controls, and manual narration-segment regeneration
- visual replacement upload and side-by-side revision comparison
- word-level narration timings and manual narration-segment replacement
- richer rendered-media preview controls and downloadable manual-publish packages
- provider settings editing remains environment-managed rather than exposing secrets to the UI
- end-to-end MVP acceptance test through an authorized social test account

## Operational blockers requiring account access

- Railway Postgres needs a public TCP/database URL before Vercel can connect. Creating that public endpoint requires explicit owner approval.
- The local Vercel CLI credential is inaccessible, so the repository still needs linking and Vercel environment configuration from an authenticated session.
- AI narration/image models and social OAuth applications/test accounts must be supplied before those paths can be proven.

## Invariants

- Scripture quotations originate in stored translation text, not model memory.
- Every generated package points to an immutable explanation revision.
- Expensive media generation cannot begin without script approval.
- Upload and workflow APIs perform real session checks; proxy cookie presence is not treated as authorization.
- Every publish request has a unique idempotency key and platform failures remain independent.
- Media binaries are not stored in PostgreSQL; records contain checksums, dimensions, provider IDs, and provenance.
- Scheduled instants are UTC and accounts retain their display time zone.
