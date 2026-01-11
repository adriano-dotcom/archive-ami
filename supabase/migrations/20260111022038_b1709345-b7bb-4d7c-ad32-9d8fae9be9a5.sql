-- =====================================================
-- FIX: Allow team members to see unassigned conversations for triage
-- =====================================================

-- 1. Update SELECT policy to include unassigned conversations
DROP POLICY IF EXISTS "conversations_select_policy" ON public.conversations;

CREATE POLICY "conversations_select_policy" ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.is_authenticated_team_member() 
      AND (
        assigned_user_id = public.get_current_team_member_id()
        OR assigned_team IS NOT NULL
        OR (assigned_user_id IS NULL AND assigned_team IS NULL)
      )
    )
  );

-- 2. Update UPDATE policy to allow claiming unassigned conversations
DROP POLICY IF EXISTS "conversations_update_policy" ON public.conversations;

CREATE POLICY "conversations_update_policy" ON public.conversations
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.is_authenticated_team_member() 
      AND (
        assigned_user_id = public.get_current_team_member_id()
        OR assigned_team IS NOT NULL
        OR (assigned_user_id IS NULL AND assigned_team IS NULL)
      )
    )
  )
  WITH CHECK (
    public.is_authenticated_team_member() 
    OR public.has_role(auth.uid(), 'admin')
  );