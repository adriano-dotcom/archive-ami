-- WhatsApp Calling: table to track VoIP calls made via WhatsApp Business Cloud API

CREATE TABLE public.whatsapp_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    conversation_id uuid,
    whatsapp_call_id text,
    direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
    status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'answered', 'ended', 'rejected', 'missed', 'failed')),
    phone_number_id text,
    from_number text NOT NULL,
    to_number text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_seconds integer,
    hangup_cause text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_calls_pkey PRIMARY KEY (id)
);


-- Indexes
CREATE INDEX idx_whatsapp_calls_contact_id ON public.whatsapp_calls USING btree (contact_id);
CREATE INDEX idx_whatsapp_calls_conversation_id ON public.whatsapp_calls USING btree (conversation_id);
CREATE UNIQUE INDEX idx_whatsapp_calls_whatsapp_call_id ON public.whatsapp_calls USING btree (whatsapp_call_id) WHERE whatsapp_call_id IS NOT NULL;
CREATE INDEX idx_whatsapp_calls_status ON public.whatsapp_calls USING btree (status);
CREATE INDEX idx_whatsapp_calls_started_at ON public.whatsapp_calls USING btree (started_at DESC);


-- Foreign keys
ALTER TABLE ONLY public.whatsapp_calls
    ADD CONSTRAINT whatsapp_calls_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.whatsapp_calls
    ADD CONSTRAINT whatsapp_calls_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


-- Auto-update updated_at
CREATE TRIGGER update_whatsapp_calls_updated_at
BEFORE UPDATE ON public.whatsapp_calls
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Row Level Security
ALTER TABLE public.whatsapp_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage whatsapp_calls"
    ON public.whatsapp_calls
    TO authenticated
    USING (public.is_authenticated_user())
    WITH CHECK (public.is_authenticated_user());
