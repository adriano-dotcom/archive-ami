CREATE TABLE public.proposal_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  cnpj text,
  razao_social text,
  rntrc text,
  rntrc_situacao text,
  endereco jsonb NOT NULL DEFAULT '{}'::jsonb,
  responsavel text,
  cpf text,
  email text,
  telefone text,
  seguro_vigente boolean,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'awaiting_acceptance',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  opened_at timestamptz,
  transmitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_drafts_contact ON public.proposal_drafts(contact_id);
CREATE INDEX idx_proposal_drafts_conversation ON public.proposal_drafts(conversation_id);

GRANT SELECT, INSERT, UPDATE ON public.proposal_drafts TO authenticated;
GRANT ALL ON public.proposal_drafts TO service_role;

ALTER TABLE public.proposal_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view proposal drafts"
  ON public.proposal_drafts FOR SELECT TO authenticated
  USING (public.is_authenticated_user());

CREATE POLICY "Staff can create proposal drafts"
  ON public.proposal_drafts FOR INSERT TO authenticated
  WITH CHECK (public.is_authenticated_user());

CREATE POLICY "Staff can update proposal drafts"
  ON public.proposal_drafts FOR UPDATE TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

CREATE TRIGGER update_proposal_drafts_updated_at
  BEFORE UPDATE ON public.proposal_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();