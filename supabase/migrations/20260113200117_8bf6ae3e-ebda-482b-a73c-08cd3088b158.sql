-- 1. Criar função SECURITY DEFINER para obter email do usuário autenticado
CREATE OR REPLACE FUNCTION public.auth_email()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid()
$$;

-- 2. Remover política problemática que causa erro de permissão
DROP POLICY IF EXISTS "Team members view access" ON public.team_members;

-- 3. Recriar política usando a função auth_email() em vez de acessar auth.users diretamente
CREATE POLICY "Team members view access" ON public.team_members
  FOR SELECT TO authenticated
  USING (
    email = public.auth_email() 
    OR public.has_role(auth.uid(), 'admin'::app_role) 
    OR public.is_authenticated_team_member()
  );

-- 4. Limpar dados incorretos das tabelas
DELETE FROM public.pending_invites;
DELETE FROM public.team_members;