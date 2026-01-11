-- Remove unique constraint on phone_number to allow same phone for multiple contacts
-- This is needed because the same person (segurado) can have multiple companies
ALTER TABLE public.contacts 
DROP CONSTRAINT IF EXISTS contacts_phone_number_unique;