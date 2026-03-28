
-- Table: reimbursement_claims
CREATE TABLE public.reimbursement_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'submitted',
  amount_requested numeric NOT NULL DEFAULT 0,
  amount_paid numeric DEFAULT 0,
  pet_name text,
  clinic_name text,
  description text,
  receipt_url text,
  paid_at timestamp with time zone,
  rejected_at timestamp with time zone,
  rejection_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.reimbursement_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can manage reimbursement_claims"
  ON public.reimbursement_claims
  FOR ALL
  TO authenticated
  USING (is_authenticated_team_member() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_authenticated_team_member() OR has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER update_reimbursement_claims_updated_at
  BEFORE UPDATE ON public.reimbursement_claims
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- View 4: orbe_reembolsos_v
CREATE OR REPLACE VIEW public.orbe_reembolsos_v
WITH (security_invoker = true)
AS
SELECT
  r.id,
  r.created_at,
  r.status,
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

-- View 5: orbe_reembolsos_daily_metrics_v
CREATE OR REPLACE VIEW public.orbe_reembolsos_daily_metrics_v
WITH (security_invoker = true)
AS
WITH today AS (
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS date_local
)
SELECT
  t.date_local,
  (SELECT COUNT(*)::int FROM reimbursement_claims WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = t.date_local) AS reembolsos_submitted_today,
  (SELECT COUNT(*)::int FROM reimbursement_claims WHERE status IN ('submitted', 'under_review')) AS reembolsos_pending_now,
  (SELECT COUNT(*)::int FROM reimbursement_claims WHERE status = 'paid' AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date = t.date_local) AS reembolsos_paid_today,
  (SELECT COUNT(*)::int FROM reimbursement_claims WHERE status IN ('submitted', 'under_review') AND created_at < now() - interval '7 days') AS reembolsos_over_7d,
  (SELECT COALESCE(SUM(amount_requested), 0) FROM reimbursement_claims WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = t.date_local) AS amount_requested_today,
  (SELECT COALESCE(SUM(amount_paid), 0) FROM reimbursement_claims WHERE status = 'paid' AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date = t.date_local) AS amount_paid_today
FROM today t;
