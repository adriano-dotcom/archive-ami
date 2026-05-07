
-- Conversations
DROP POLICY IF EXISTS conversations_select_policy ON public.conversations;
DROP POLICY IF EXISTS conversations_insert_policy ON public.conversations;
DROP POLICY IF EXISTS conversations_update_policy ON public.conversations;

CREATE POLICY conversations_select_policy ON public.conversations
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) OR is_authenticated_team_member());

CREATE POLICY conversations_insert_policy ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) OR is_authenticated_team_member());

CREATE POLICY conversations_update_policy ON public.conversations
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) OR is_authenticated_team_member())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) OR is_authenticated_team_member());

-- Messages
DROP POLICY IF EXISTS "Team members can manage messages" ON public.messages;

CREATE POLICY "Team members can manage messages" ON public.messages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) OR is_authenticated_team_member())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) OR is_authenticated_team_member());

-- Call logs (mesma incoerência)
DROP POLICY IF EXISTS "Team members can manage call_logs" ON public.call_logs;

CREATE POLICY "Team members can manage call_logs" ON public.call_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) OR is_authenticated_team_member())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) OR is_authenticated_team_member());
