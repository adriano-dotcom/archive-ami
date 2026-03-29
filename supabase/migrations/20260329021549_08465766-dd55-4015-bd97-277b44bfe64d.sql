ALTER TABLE public.reimbursement_claims ADD COLUMN IF NOT EXISTS claim_type text DEFAULT 'consulta';

DROP VIEW IF EXISTS public.orbe_reembolsos_v;

CREATE VIEW public.orbe_reembolsos_v AS
SELECT 
  r.id,
  r.created_at,
  r.status,
  r.claim_type,
  ct.name AS customer_name,
  ct.phone_number AS customer_phone,
  r.pet_name,
  r.amount_requested,
  r.amount_paid,
  r.clinic_name,
  r.updated_at,
  r.paid_at
FROM reimbursement_claims r
LEFT JOIN contacts ct ON ct.id = r.contact_id;