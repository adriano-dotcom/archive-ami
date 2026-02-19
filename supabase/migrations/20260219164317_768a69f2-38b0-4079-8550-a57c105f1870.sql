
CREATE TABLE public.whatsapp_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_call_id text UNIQUE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'answered', 'ended', 'rejected', 'missed', 'failed')),
  phone_number_id text,
  from_number text,
  to_number text,
  started_at timestamp with time zone DEFAULT now(),
  answered_at timestamp with time zone,
  ended_at timestamp with time zone,
  duration_seconds integer,
  hangup_cause text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view whatsapp_calls"
  ON public.whatsapp_calls FOR SELECT
  USING (is_authenticated_team_member() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role));

CREATE POLICY "Admins can manage whatsapp_calls"
  ON public.whatsapp_calls FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_whatsapp_calls_updated_at
  BEFORE UPDATE ON public.whatsapp_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_whatsapp_calls_contact_id ON public.whatsapp_calls(contact_id);
CREATE INDEX idx_whatsapp_calls_conversation_id ON public.whatsapp_calls(conversation_id);
CREATE INDEX idx_whatsapp_calls_status ON public.whatsapp_calls(status);
CREATE INDEX idx_whatsapp_calls_started_at ON public.whatsapp_calls(started_at DESC);
