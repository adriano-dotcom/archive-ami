CREATE TABLE public.quick_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  category text,
  shortcut text,
  created_by uuid REFERENCES auth.users,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_replies TO authenticated;
GRANT ALL ON public.quick_replies TO service_role;

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can view quick replies"
  ON public.quick_replies FOR SELECT
  TO authenticated
  USING (public.is_authenticated_user());

CREATE POLICY "Authenticated team can insert quick replies"
  ON public.quick_replies FOR INSERT
  TO authenticated
  WITH CHECK (public.is_authenticated_user());

CREATE POLICY "Authenticated team can update quick replies"
  ON public.quick_replies FOR UPDATE
  TO authenticated
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());

CREATE POLICY "Authenticated team can delete quick replies"
  ON public.quick_replies FOR DELETE
  TO authenticated
  USING (public.is_authenticated_user());

CREATE TRIGGER update_quick_replies_updated_at
  BEFORE UPDATE ON public.quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();