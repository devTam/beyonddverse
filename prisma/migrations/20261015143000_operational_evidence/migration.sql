ALTER TABLE "publication_attempts"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "remote_operation_id" TEXT,
  ADD COLUMN "resumable_state" JSONB;

CREATE UNIQUE INDEX "publication_attempts_idempotency_key_key" ON "publication_attempts"("idempotency_key");

CREATE TABLE "alert_delivery_attempts" (
  "id" UUID NOT NULL,
  "alert_id" UUID NOT NULL,
  "channel" TEXT NOT NULL,
  "recipient_hash" TEXT,
  "status" TEXT NOT NULL,
  "provider_id" TEXT,
  "response_code" INTEGER,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "alert_delivery_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alert_delivery_attempts_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "operational_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "alert_delivery_attempts_alert_id_status_idx" ON "alert_delivery_attempts"("alert_id", "status");

CREATE TABLE "backup_tests" (
  "id" UUID NOT NULL,
  "source" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "verification" JSONB,
  "error" TEXT,
  CONSTRAINT "backup_tests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "backup_tests_status_started_at_idx" ON "backup_tests"("status", "started_at");

CREATE TABLE "acceptance_evidence" (
  "id" UUID NOT NULL,
  "requirement" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "acceptance_evidence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "acceptance_evidence_status_recorded_at_idx" ON "acceptance_evidence"("status", "recorded_at");
