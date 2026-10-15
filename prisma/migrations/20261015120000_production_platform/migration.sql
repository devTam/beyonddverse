ALTER TABLE "assets"
  ADD COLUMN "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "parent_id" UUID,
  ADD COLUMN "project_id" UUID,
  ADD COLUMN "license" TEXT;

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "social_accounts"
  ADD COLUMN "encrypted_refresh_token" TEXT,
  ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "provider_metadata" JSONB,
  ADD COLUMN "disconnected_at" TIMESTAMP(3),
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "published_posts"
  ADD COLUMN "remote_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "last_reconciled_at" TIMESTAMP(3);

ALTER TABLE "generation_costs"
  ADD COLUMN "model" TEXT,
  ADD COLUMN "estimated" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "oauth_states" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "state_hash" TEXT NOT NULL,
  "code_verifier" TEXT,
  "redirect_uri" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "oauth_states_state_hash_key" ON "oauth_states"("state_hash");
CREATE INDEX "oauth_states_provider_expires_at_idx" ON "oauth_states"("provider", "expires_at");

CREATE TABLE "publication_attempts" (
  "id" UUID NOT NULL,
  "scheduled_post_id" UUID NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "request" JSONB,
  "response" JSONB,
  "error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "publication_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "publication_attempts_scheduled_post_id_attempt_key" ON "publication_attempts"("scheduled_post_id", "attempt");
ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_scheduled_post_id_fkey" FOREIGN KEY ("scheduled_post_id") REFERENCES "scheduled_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "workspace_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "operational_alerts" (
  "id" UUID NOT NULL,
  "severity" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "metadata" JSONB,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "operational_alerts_resolved_at_severity_created_at_idx" ON "operational_alerts"("resolved_at", "severity", "created_at");

CREATE TABLE "rate_limit_entries" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "window_start" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rate_limit_entries_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "rate_limit_entries_expires_at_idx" ON "rate_limit_entries"("expires_at");
