ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS ctwa_clid TEXT,
  ADD COLUMN IF NOT EXISTS referral_source_url TEXT,
  ADD COLUMN IF NOT EXISTS referral_headline TEXT;