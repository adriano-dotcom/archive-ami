-- First, let's handle any potential duplicates by keeping only the most recent contact per phone_number
-- This uses a CTE to identify duplicates and delete all but the most recently updated one

WITH duplicates AS (
  SELECT id, phone_number,
    ROW_NUMBER() OVER (PARTITION BY phone_number ORDER BY updated_at DESC, created_at DESC) as rn
  FROM contacts
  WHERE phone_number IS NOT NULL
)
DELETE FROM contacts
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Now add the UNIQUE constraint
ALTER TABLE contacts 
ADD CONSTRAINT contacts_phone_number_key 
UNIQUE (phone_number);