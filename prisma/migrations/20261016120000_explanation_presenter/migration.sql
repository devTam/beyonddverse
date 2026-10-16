-- AlterTable
ALTER TABLE "scripts" ADD COLUMN     "presenter_snapshot" JSONB,
ADD COLUMN     "production_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "scripture_translation" TEXT NOT NULL DEFAULT 'WEB';

-- AlterTable
ALTER TABLE "script_scenes" ADD COLUMN     "presentation" TEXT NOT NULL DEFAULT 'cutaway',
ADD COLUMN     "scripture_cue" TEXT,
ADD COLUMN     "scripture_excerpt" TEXT;

-- AlterTable
ALTER TABLE "narrations" ADD COLUMN     "source_hash" TEXT;

-- CreateTable
CREATE TABLE "presenter_profiles" (
    "id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "portrait_asset_id" UUID NOT NULL,
    "voice_id" TEXT NOT NULL,
    "speech_model" TEXT NOT NULL,
    "speech_speed" DOUBLE PRECISION NOT NULL,
    "pronunciation_dictionary" JSONB NOT NULL,
    "appearance" TEXT NOT NULL,
    "provider_avatar_id" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "presenter_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avatar_generations" (
    "id" UUID NOT NULL,
    "input_hash" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "scene_id" UUID,
    "narration_id" UUID,
    "audio_asset_id" UUID NOT NULL,
    "asset_id" UUID,
    "external_job_id" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "rate_per_minute" DOUBLE PRECISION NOT NULL,
    "submission_started_at" TIMESTAMP(3),
    "cost_recorded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avatar_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "presenter_profiles_revision_key" ON "presenter_profiles"("revision");

-- CreateIndex
CREATE UNIQUE INDEX "avatar_generations_input_hash_key" ON "avatar_generations"("input_hash");

-- CreateIndex
CREATE UNIQUE INDEX "avatar_generations_external_job_id_key" ON "avatar_generations"("external_job_id");

-- CreateIndex
CREATE INDEX "avatar_generations_scene_id_status_idx" ON "avatar_generations"("scene_id", "status");

-- AddForeignKey
ALTER TABLE "presenter_profiles" ADD CONSTRAINT "presenter_profiles_portrait_asset_id_fkey" FOREIGN KEY ("portrait_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_generations" ADD CONSTRAINT "avatar_generations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "presenter_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_generations" ADD CONSTRAINT "avatar_generations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "chapter_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_generations" ADD CONSTRAINT "avatar_generations_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "script_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_generations" ADD CONSTRAINT "avatar_generations_narration_id_fkey" FOREIGN KEY ("narration_id") REFERENCES "narrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_generations" ADD CONSTRAINT "avatar_generations_audio_asset_id_fkey" FOREIGN KEY ("audio_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_generations" ADD CONSTRAINT "avatar_generations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

