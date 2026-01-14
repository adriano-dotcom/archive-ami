-- Add configurable message cost column
ALTER TABLE nina_settings 
ADD COLUMN IF NOT EXISTS message_cost_per_unit DECIMAL(10,4) DEFAULT 0.41;

COMMENT ON COLUMN nina_settings.message_cost_per_unit IS 'Custo em R$ por mensagem enviada (WhatsApp/Email)';