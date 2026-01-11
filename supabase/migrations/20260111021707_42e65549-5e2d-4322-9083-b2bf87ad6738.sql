-- =====================================================
-- SECURITY FIX: Restrictive RLS for Conversations
-- Team members can see conversations assigned to them OR to any team
-- Admins can see all conversations
-- =====================================================

-- 1. Create helper function to get current team member id
CREATE OR REPLACE FUNCTION public.get_current_team_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id 
  FROM public.team_members 
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND status = 'active'
  LIMIT 1
$$;

-- 2. Drop existing permissive policies on conversations
DROP POLICY IF EXISTS "Enable all access for anon" ON public.conversations;
DROP POLICY IF EXISTS "Enable all access for authenticated" ON public.conversations;
DROP POLICY IF EXISTS "Allow all operations for anon users" ON public.conversations;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.conversations;
DROP POLICY IF EXISTS "Team members can manage conversations" ON public.conversations;

-- 3. Create new restrictive SELECT policy
-- Team members can see: conversations assigned to them OR assigned to any team
-- Admins can see all
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
      )
    )
  );

-- 4. Create INSERT policy - team members can create conversations
CREATE POLICY "conversations_insert_policy" ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_authenticated_team_member() 
    OR public.has_role(auth.uid(), 'admin')
  );

-- 5. Create UPDATE policy - team members can update conversations they can see
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
      )
    )
  )
  WITH CHECK (
    public.is_authenticated_team_member() 
    OR public.has_role(auth.uid(), 'admin')
  );

-- 6. Create DELETE policy - only admins can delete conversations
CREATE POLICY "conversations_delete_policy" ON public.conversations
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));