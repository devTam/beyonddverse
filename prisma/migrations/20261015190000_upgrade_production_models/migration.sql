-- Upgrade only the previous application defaults. Custom model selections are preserved.
UPDATE "workspace_settings"
SET "value" = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          "value",
          '{textModel}',
          CASE WHEN "value"->>'textModel' = 'openai/gpt-5.4-mini'
            THEN '"openai/gpt-5.4"'::jsonb ELSE COALESCE("value"->'textModel', '"openai/gpt-5.4"'::jsonb) END
        ),
        '{transcriptionModel}',
        CASE WHEN "value"->>'transcriptionModel' = 'openai/gpt-4o-mini-transcribe'
          THEN '"openai/gpt-4o-transcribe"'::jsonb ELSE COALESCE("value"->'transcriptionModel', '"openai/gpt-4o-transcribe"'::jsonb) END
      ),
      '{speechModel}',
      CASE WHEN "value"->>'speechModel' = 'openai/gpt-4o-mini-tts'
        THEN '"fish-audio/drama-3"'::jsonb ELSE COALESCE("value"->'speechModel', '"fish-audio/drama-3"'::jsonb) END
    ),
    '{imageModel}',
    CASE WHEN "value"->>'imageModel' = 'google/gemini-3.1-flash-image-preview'
      THEN '"openai/gpt-image-2.5-flare"'::jsonb ELSE COALESCE("value"->'imageModel', '"openai/gpt-image-2.5-flare"'::jsonb) END
  ),
  '{thumbnailModel}',
  COALESCE("value"->'thumbnailModel', '"openai/gpt-image-2.5-sunburst"'::jsonb)
),
"updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'productionSettings';

UPDATE "workspace_settings"
SET "value" = jsonb_set("value", '{narratorVoice}', '"933563129e564b19a115bedd57b7406a"'::jsonb),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'productionSettings'
  AND "value"->>'speechModel' = 'fish-audio/drama-3'
  AND COALESCE("value"->>'narratorVoice', 'alloy') = 'alloy';
