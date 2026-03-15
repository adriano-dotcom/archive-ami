
-- Nurture sequences table
CREATE TABLE public.nurture_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL DEFAULT 'lead_capture',
  landing_page_id uuid REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nurture_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage nurture_sequences"
  ON public.nurture_sequences FOR ALL TO authenticated
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

-- Enrollments table
CREATE TABLE public.lead_nurture_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.nurture_sequences(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_capture_id uuid REFERENCES public.lead_captures(id) ON DELETE SET NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  current_step integer NOT NULL DEFAULT -1,
  status text NOT NULL DEFAULT 'active',
  last_step_sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sequence_id, contact_id)
);

ALTER TABLE public.lead_nurture_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage lead_nurture_enrollments"
  ON public.lead_nurture_enrollments FOR ALL TO authenticated
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

-- Step logs table
CREATE TABLE public.nurture_step_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.lead_nurture_enrollments(id) ON DELETE CASCADE,
  step_index integer NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nurture_step_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage nurture_step_logs"
  ON public.nurture_step_logs FOR ALL TO authenticated
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

-- Updated_at trigger for nurture_sequences
CREATE TRIGGER update_nurture_sequences_updated_at
  BEFORE UPDATE ON public.nurture_sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
