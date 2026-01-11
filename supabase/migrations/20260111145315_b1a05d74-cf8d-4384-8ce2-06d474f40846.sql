-- Add collection email configuration columns to nina_settings
ALTER TABLE nina_settings 
ADD COLUMN IF NOT EXISTS collection_email_from TEXT DEFAULT 'Jacometo Seguros <jacometo@jacometo.com.br>',
ADD COLUMN IF NOT EXISTS collection_email_bcc TEXT[] DEFAULT ARRAY['joao.pedro@jacometo.com.br'];