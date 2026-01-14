-- Create function to sync contact data with linked company
CREATE OR REPLACE FUNCTION sync_contact_company_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if company_id was set or changed
  IF NEW.company_id IS NOT NULL AND 
     (OLD IS NULL OR OLD.company_id IS NULL OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
    
    -- Update contact with company data (only if contact fields are null)
    UPDATE contacts
    SET 
      cnpj = COALESCE(contacts.cnpj, c.cnpj),
      company = COALESCE(contacts.company, c.razao_social)
    FROM companies c
    WHERE c.id = NEW.company_id
      AND contacts.id = NEW.id;
      
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on contacts table
DROP TRIGGER IF EXISTS trigger_sync_contact_company_data ON contacts;
CREATE TRIGGER trigger_sync_contact_company_data
AFTER INSERT OR UPDATE OF company_id ON contacts
FOR EACH ROW
EXECUTE FUNCTION sync_contact_company_data();

-- One-time migration: sync existing contacts that have company_id but missing cnpj/company
UPDATE contacts c
SET 
  cnpj = COALESCE(c.cnpj, co.cnpj),
  company = COALESCE(c.company, co.razao_social)
FROM companies co
WHERE c.company_id = co.id
  AND c.company_id IS NOT NULL
  AND (c.cnpj IS NULL OR c.company IS NULL);