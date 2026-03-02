-- nina_settings: remover 7 colunas pipedrive_*
ALTER TABLE public.nina_settings
  DROP COLUMN IF EXISTS pipedrive_enabled,
  DROP COLUMN IF EXISTS pipedrive_min_score,
  DROP COLUMN IF EXISTS pipedrive_field_mappings,
  DROP COLUMN IF EXISTS pipedrive_api_token,
  DROP COLUMN IF EXISTS pipedrive_domain,
  DROP COLUMN IF EXISTS pipedrive_default_pipeline_id,
  DROP COLUMN IF EXISTS pipedrive_token_in_vault;

-- contacts: remover pipedrive_person_id
ALTER TABLE public.contacts
  DROP COLUMN IF EXISTS pipedrive_person_id;