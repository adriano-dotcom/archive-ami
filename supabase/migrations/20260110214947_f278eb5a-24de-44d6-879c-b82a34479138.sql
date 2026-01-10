-- =============================================
-- FASE 2: LIMPEZA DE BANCO DE DADOS
-- =============================================

-- Remover coluna pipeline_ids da tabela followup_automations
ALTER TABLE public.followup_automations DROP COLUMN IF EXISTS pipeline_ids;

-- =============================================
-- FASE 3: SEGURANÇA - POLÍTICAS RLS APRIMORADAS
-- =============================================

-- 1. Criar função has_role para verificar roles sem recursão
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 2. Criar função is_authenticated_team_member para verificar se usuário é membro da equipe
-- Usa o email do usuário autenticado para verificar se é membro ativo
CREATE OR REPLACE FUNCTION public.is_authenticated_team_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
      AND tm.status = 'active'
  )
$$;

-- 3. Atualizar políticas de tabelas sensíveis

-- CONTACTS: Apenas membros da equipe podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can manage contacts" ON public.contacts;
DROP POLICY IF EXISTS "Team members can manage contacts" ON public.contacts;

CREATE POLICY "Team members can manage contacts" ON public.contacts
  FOR ALL
  TO authenticated
  USING (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'));

-- COMPANIES: Apenas membros da equipe podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can manage companies" ON public.companies;
DROP POLICY IF EXISTS "Team members can manage companies" ON public.companies;

CREATE POLICY "Team members can manage companies" ON public.companies
  FOR ALL
  TO authenticated
  USING (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'));

-- MESSAGES: Apenas membros da equipe podem ver
DROP POLICY IF EXISTS "Authenticated users can manage messages" ON public.messages;
DROP POLICY IF EXISTS "Team members can manage messages" ON public.messages;

CREATE POLICY "Team members can manage messages" ON public.messages
  FOR ALL
  TO authenticated
  USING (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'));

-- CONVERSATIONS: Apenas membros da equipe podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can manage conversations" ON public.conversations;
DROP POLICY IF EXISTS "Team members can manage conversations" ON public.conversations;

CREATE POLICY "Team members can manage conversations" ON public.conversations
  FOR ALL
  TO authenticated
  USING (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'));

-- INSTALLMENTS: Apenas membros da equipe podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can manage installments" ON public.installments;
DROP POLICY IF EXISTS "Team members can manage installments" ON public.installments;

CREATE POLICY "Team members can manage installments" ON public.installments
  FOR ALL
  TO authenticated
  USING (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'));

-- POLICIES (apólices): Apenas membros da equipe podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can manage policies" ON public.policies;
DROP POLICY IF EXISTS "Team members can manage policies" ON public.policies;

CREATE POLICY "Team members can manage policies" ON public.policies
  FOR ALL
  TO authenticated
  USING (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'));

-- CALL_LOGS: Apenas membros da equipe podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can manage call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Team members can manage call_logs" ON public.call_logs;

CREATE POLICY "Team members can manage call_logs" ON public.call_logs
  FOR ALL
  TO authenticated
  USING (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'));

-- COLLECTION_ATTEMPTS: Apenas membros da equipe podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can manage collection_attempts" ON public.collection_attempts;
DROP POLICY IF EXISTS "Team members can manage collection_attempts" ON public.collection_attempts;

CREATE POLICY "Team members can manage collection_attempts" ON public.collection_attempts
  FOR ALL
  TO authenticated
  USING (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'));

-- TEAM_MEMBERS: Membros podem ver seu próprio perfil via email, admins podem ver todos
DROP POLICY IF EXISTS "Authenticated users can manage team_members" ON public.team_members;
DROP POLICY IF EXISTS "Team members can view themselves" ON public.team_members;
DROP POLICY IF EXISTS "Admins can manage all team members" ON public.team_members;
DROP POLICY IF EXISTS "Team members view access" ON public.team_members;

CREATE POLICY "Team members view access" ON public.team_members
  FOR SELECT
  TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid()) 
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_authenticated_team_member()
  );

CREATE POLICY "Admins can manage all team members" ON public.team_members
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- USER_ROLES: Apenas admins podem gerenciar roles
DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_policy" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_policy" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_policy" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can manage roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can manage roles" ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Corrigir funções com search_path mutable
-- Atualizar funções existentes para ter search_path fixo

-- update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- update_contact_last_activity
CREATE OR REPLACE FUNCTION public.update_contact_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE contacts
  SET last_activity = NOW()
  WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- update_conversation_last_message
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.sent_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;