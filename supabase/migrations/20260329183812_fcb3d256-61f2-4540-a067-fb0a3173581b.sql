ALTER VIEW public.orbe_reembolsos_v SET (security_invoker = on);
ALTER VIEW public.orbe_support_tickets_v SET (security_invoker = on);
ALTER VIEW public.contacts_with_stats SET (security_invoker = on);

DROP POLICY IF EXISTS "Authenticated users can create installment history" ON public.installment_history;

CREATE POLICY "Team members can create installment history"
ON public.installment_history
FOR INSERT
TO authenticated
WITH CHECK (
  is_authenticated_team_member() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role)
);