# Architecture and implementation status

Beyond the Verse is currently a Next.js modular monolith backed by PostgreSQL/Prisma. Trigger.dev runs durable orchestration outside request handlers. Media lives in authenticated Cloudinary assets. Remotion/FFmpeg rendering will run on a dedicated worker, never in Vercel Functions.

## Implemented and verified

- Better Auth administrator login, database sessions, route proxy, server-side mutation authorization, and administrator email allowlist
- 66-book Protestant canon, all 1,189 chapters, and the complete 31,098-verse public-domain WEB corpus
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
- encrypted OAuth connections and official YouTube, Instagram, Facebook, and TikTok publisher adapters
- publication attempt history, remote reconciliation, official analytics collection, and analytics dashboards
- asset approval library, thumbnail generation, background-music selection, and generation budget enforcement
- Sentry instrumentation across Next.js, Trigger.dev, and the render worker; database-backed authentication rate limiting; CSP/security headers; operational alerts; and worker readiness checks
- production web build, Trigger.dev bundle dry-run, strict type check, lint, unit tests, and auth HTTP behavior

## Remaining acceptance dependencies

- side-by-side visual revision comparison and manual narration-segment replacement
- provider settings editing remains environment-managed rather than exposing secrets to the UI
- end-to-end MVP acceptance test through an authorized social test account

## Operational blockers requiring account access

- Vercel project creation is awaiting confirmation of the intended authenticated Vercel team.
- Trigger.dev needs `AI_GATEWAY_API_KEY` because it cannot use Vercel deployment OIDC.
- `ADMIN_EMAIL`, social OAuth application credentials/test accounts, and `SENTRY_DSN` must be supplied before their production paths can be proven.

## Invariants

- Scripture quotations originate in stored translation text, not model memory.
- Every generated package points to an immutable explanation revision.
- Expensive media generation cannot begin without script approval.
- Upload and workflow APIs perform real session checks; proxy cookie presence is not treated as authorization.
- Every publish request has a unique idempotency key and platform failures remain independent.
- Media binaries are not stored in PostgreSQL; records contain checksums, dimensions, provider IDs, and provenance.
- Scheduled instants are UTC and accounts retain their display time zone.

## Explanation-led productions (v2)

The complete spoken lesson lives in ordered `ScriptScene.narration` values. `Script.body` is their derived transcript, not a second editable script. Spoken lessons, shorts, and regenerated sections explicitly speak in the user’s own first-person teaching voice (I/my or we/us/our), with no third-person attribution to the human source. Validation checks generation, approval, narration, and rendering; Scripture quotations retain their original grammatical person, and God can still be called the Creator. Generation does not invent personal testimony. Content-generation cache keys include the voice-policy version so older output is not reused when generating under the new rule. Existing saved scripts require regeneration or editorial revision. Generation faithfully polishes the supplied explanation; it does not impose an 8–12 minute duration. The development provider preserves the actual input instead of substituting a fixed Genesis lesson.

Presenter profiles are versioned, reusable fictional identities. In Settings, generate or upload a fictional portrait, approve the image, save a presenter version, generate its speaking preview, and approve face and voice. A script approval snapshots that profile's identity, provider Look ID, voice, speech model, speed, pronunciations, and appearance. Changing workspace speech defaults does not change an approved production.

Presenter scenes use HeyGen v3 `POST /videos` with Avatar IV and the exact scene narration audio URL. Cutaways use the same narrator configuration with approved images or uploaded video clips. Supporting clips loop silently if shorter than a scene. Presenter video audio is muted during composition; the approved narration track is mixed exactly once. Scene media requires review before rendering.

`AvatarGeneration` persists input identity, audio and narration IDs, external job ID, submission time, cost estimate, and stored output. Requests carry HeyGen's `Idempotency-Key`; jobs resume polling/downloading without another submission. An uncertain submission older than 23 hours is blocked for reconciliation rather than risking a new charge after the provider's 24-hour replay window. Provider-declared failed jobs require inspection; transient status/download errors can resume the saved job. Estimated generation cost is recorded once at submission, including failed paid generations.

Scripture cards resolve exact verse text from the script's selected translation, including references outside the project's chapter. References require an exact narration cue. Long excerpts paginate independently of subtitles; passages too long for the remaining scene must be shortened or cued earlier. Caption pages use measured text widths, a maximum of two lines and six words, and narration segment alignment. Transcription words must match the approved narration; missing or different speech blocks generation. The dedicated caption alignment model defaults to `openai/whisper-1` with word timestamps; ordinary source transcription keeps its separate model. If an alignment provider returns only longer segments, word timing within each segment is interpolated. Numeric spelling and punctuation may differ in transcription while the approved caption text is preserved. Final timing still needs listening review.

New renders snapshot media and production settings and recheck them before marking success and before publishing. Superseded explanations, packages, scripts, narration configurations, or unapproved media cannot become a current successful production. Historical videos remain viewable and downloadable. Legacy scripts must be regenerated from their explanation for the presenter format.

### Setup and verification

- Apply migrations with `npx prisma migrate deploy`, then regenerate the client with `npx prisma generate`.
- Configure server-only `HEYGEN_API_KEY` with funded API credits. Optional `HEYGEN_AVATAR_COST_PER_MINUTE_USD` defaults to 2.31; the workspace rate is editable in Settings. One-time Photo Avatar registration is tracked separately with `HEYGEN_AVATAR_CREATION_COST_USD` (default 1.32). Recheck [HeyGen's current pricing](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained) before production. The [audio-to-video API](https://developers.heygen.com/audio-to-video) accepts the existing narration.
- Set `NARRATION_ALIGNMENT_MODEL` to a timestamp-capable model (default `openai/whisper-1`) and maintain `AI_ALIGNMENT_COST_PER_MINUTE_USD` (default 0.006). Configure the existing AI Gateway, Cloudinary, Trigger.dev, and render-worker credentials. Deploy the new `generate-presenter` and `generate-presenter-portrait` tasks alongside the updated narration, visual, and rendering tasks.
- Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- Against a disposable, migrated, seeded local database, run `BTV_DISPOSABLE_DATABASE=1 DATABASE_URL=... node --conditions=react-server --import tsx scripts/verify-production.ts`. This writes fixture metadata only, verifies the complete lesson-to-render-input path, and exercises stale-media rejection. Never run it against live data.
- On macOS ARM with Chrome installed, `npx tsx scripts/verify-teaching-video.ts` generates landscape/portrait frame previews and short transition clips under `/tmp/btv-video-verification`. It uses labeled local fixtures and a tone, makes no provider calls, and cannot verify human likeness, natural delivery, or lip sync.
- Live acceptance remains: approve an original portrait and voice preview, generate a complete lesson through the configured providers, review identity continuity and lip sync, confirm Scripture/caption timing, and inspect both final aspect ratios and recorded cost.
