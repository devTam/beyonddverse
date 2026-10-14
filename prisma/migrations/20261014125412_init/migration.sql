-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'WRITING', 'SCRIPT_REVIEW', 'MEDIA_PRODUCTION', 'FINAL_REVIEW', 'SCHEDULED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('SOURCE_AUDIO', 'NARRATION', 'IMAGE', 'MUSIC', 'VIDEO', 'THUMBNAIL', 'SUBTITLE');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'MANUAL_REQUIRED', 'CANCELED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "license" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_books" (
    "id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "testament" TEXT NOT NULL,

    CONSTRAINT "bible_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_chapters" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "bible_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_verses" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "translation_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "bible_verses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cross_references" (
    "id" UUID NOT NULL,
    "source_chapter_id" UUID NOT NULL,
    "target_chapter_id" UUID NOT NULL,
    "source_verse" INTEGER,
    "target_verse" INTEGER,
    "note" TEXT,

    CONSTRAINT "cross_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_projects" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "current_stage" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "explanations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "author_id" UUID,
    "revision" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "original_text" TEXT NOT NULL,
    "editable_text" TEXT NOT NULL,
    "source_asset_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_packages" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "explanation_id" UUID NOT NULL,
    "prompt_version_id" UUID,
    "version" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "outline" JSONB NOT NULL,
    "social_copy" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "validation_report" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" UUID NOT NULL,
    "content_package_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "script_scenes" (
    "id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "narration" TEXT NOT NULL,
    "visual_type" TEXT NOT NULL,
    "visual_prompt" TEXT NOT NULL,
    "scripture_ref" TEXT,
    "duration_ms" INTEGER NOT NULL,

    CONSTRAINT "script_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "provider_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_usages" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "scene_id" UUID,
    "role" TEXT NOT NULL,

    CONSTRAINT "asset_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "narrations" (
    "id" UUID NOT NULL,
    "scene_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "voice_id" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "timings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "narrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_renders" (
    "id" UUID NOT NULL,
    "asset_id" UUID,
    "format" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'QUEUED',
    "composition" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_renders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_variants" (
    "id" UUID NOT NULL,
    "content_package_id" UUID NOT NULL,
    "video_render_id" UUID,
    "platform" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "content_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "encrypted_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_posts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotency_key" TEXT NOT NULL,

    CONSTRAINT "scheduled_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_posts" (
    "id" UUID NOT NULL,
    "scheduled_post_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "raw_response" JSONB,

    CONSTRAINT "published_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" UUID NOT NULL,
    "published_post_id" UUID NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotency_key" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_settings" (
    "id" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "encrypted_config" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_costs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "amount_micros" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "units" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_events" (
    "id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "translations_code_key" ON "translations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bible_books_ordinal_key" ON "bible_books"("ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "bible_books_name_key" ON "bible_books"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bible_books_slug_key" ON "bible_books"("slug");

-- CreateIndex
CREATE INDEX "bible_chapters_book_id_idx" ON "bible_chapters"("book_id");

-- CreateIndex
CREATE UNIQUE INDEX "bible_chapters_book_id_number_key" ON "bible_chapters"("book_id", "number");

-- CreateIndex
CREATE INDEX "bible_verses_chapter_id_translation_id_idx" ON "bible_verses"("chapter_id", "translation_id");

-- CreateIndex
CREATE UNIQUE INDEX "bible_verses_chapter_id_translation_id_number_key" ON "bible_verses"("chapter_id", "translation_id", "number");

-- CreateIndex
CREATE INDEX "cross_references_source_chapter_id_idx" ON "cross_references"("source_chapter_id");

-- CreateIndex
CREATE INDEX "chapter_projects_chapter_id_status_idx" ON "chapter_projects"("chapter_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "explanations_project_id_revision_key" ON "explanations"("project_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_key_version_key" ON "prompt_versions"("key", "version");

-- CreateIndex
CREATE INDEX "content_packages_project_id_status_idx" ON "content_packages"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_packages_project_id_version_key" ON "content_packages"("project_id", "version");

-- CreateIndex
CREATE INDEX "scripts_content_package_id_status_idx" ON "scripts"("content_package_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scripts_content_package_id_kind_revision_key" ON "scripts"("content_package_id", "kind", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "script_scenes_script_id_position_key" ON "script_scenes"("script_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "assets_storage_key_key" ON "assets"("storage_key");

-- CreateIndex
CREATE INDEX "assets_kind_created_at_idx" ON "assets"("kind", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "asset_usages_asset_id_scene_id_role_key" ON "asset_usages"("asset_id", "scene_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "narrations_scene_id_input_hash_key" ON "narrations"("scene_id", "input_hash");

-- CreateIndex
CREATE INDEX "video_renders_status_created_at_idx" ON "video_renders"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "content_variants_content_package_id_platform_kind_key" ON "content_variants"("content_package_id", "platform", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_platform_external_id_key" ON "social_accounts"("platform", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_posts_idempotency_key_key" ON "scheduled_posts"("idempotency_key");

-- CreateIndex
CREATE INDEX "scheduled_posts_status_scheduled_at_idx" ON "scheduled_posts"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "published_posts_scheduled_post_id_key" ON "published_posts"("scheduled_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_published_post_id_captured_at_key" ON "analytics_snapshots"("published_post_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_runs_idempotency_key_key" ON "workflow_runs"("idempotency_key");

-- CreateIndex
CREATE INDEX "workflow_runs_status_type_idx" ON "workflow_runs"("status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_run_id_position_key" ON "workflow_steps"("run_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_settings_capability_key" ON "ai_provider_settings"("capability");

-- CreateIndex
CREATE INDEX "generation_costs_project_id_created_at_idx" ON "generation_costs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "approval_events_script_id_created_at_idx" ON "approval_events"("script_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- AddForeignKey
ALTER TABLE "bible_chapters" ADD CONSTRAINT "bible_chapters_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "bible_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verses" ADD CONSTRAINT "bible_verses_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "bible_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verses" ADD CONSTRAINT "bible_verses_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "translations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_references" ADD CONSTRAINT "cross_references_source_chapter_id_fkey" FOREIGN KEY ("source_chapter_id") REFERENCES "bible_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_references" ADD CONSTRAINT "cross_references_target_chapter_id_fkey" FOREIGN KEY ("target_chapter_id") REFERENCES "bible_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_projects" ADD CONSTRAINT "chapter_projects_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "bible_chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explanations" ADD CONSTRAINT "explanations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "chapter_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explanations" ADD CONSTRAINT "explanations_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explanations" ADD CONSTRAINT "explanations_source_asset_id_fkey" FOREIGN KEY ("source_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "chapter_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_explanation_id_fkey" FOREIGN KEY ("explanation_id") REFERENCES "explanations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_content_package_id_fkey" FOREIGN KEY ("content_package_id") REFERENCES "content_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "scripts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "script_scenes" ADD CONSTRAINT "script_scenes_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_usages" ADD CONSTRAINT "asset_usages_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_usages" ADD CONSTRAINT "asset_usages_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "script_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narrations" ADD CONSTRAINT "narrations_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "script_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narrations" ADD CONSTRAINT "narrations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_renders" ADD CONSTRAINT "video_renders_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_content_package_id_fkey" FOREIGN KEY ("content_package_id") REFERENCES "content_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_video_render_id_fkey" FOREIGN KEY ("video_render_id") REFERENCES "video_renders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "chapter_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "content_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_posts" ADD CONSTRAINT "published_posts_scheduled_post_id_fkey" FOREIGN KEY ("scheduled_post_id") REFERENCES "scheduled_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_published_post_id_fkey" FOREIGN KEY ("published_post_id") REFERENCES "published_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "chapter_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_costs" ADD CONSTRAINT "generation_costs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "chapter_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
