-- Remove lead automation columns from nina_settings
ALTER TABLE nina_settings
DROP COLUMN IF EXISTS facebook_lead_template,
DROP COLUMN IF EXISTS facebook_lead_email_template,
DROP COLUMN IF EXISTS facebook_whatsapp_enabled,
DROP COLUMN IF EXISTS facebook_email_enabled,
DROP COLUMN IF EXISTS google_lead_template,
DROP COLUMN IF EXISTS google_lead_email_template,
DROP COLUMN IF EXISTS google_whatsapp_enabled,
DROP COLUMN IF EXISTS google_email_enabled;