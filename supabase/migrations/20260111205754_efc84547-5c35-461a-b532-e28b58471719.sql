-- 1. Ativar o status do team_member para joao.pedro@jacometo.com.br
UPDATE team_members 
SET status = 'active' 
WHERE email = 'joao.pedro@jacometo.com.br';

-- 2. Atualizar políticas RLS para policies (incluir operator)
DROP POLICY IF EXISTS "Team members can manage policies" ON policies;

CREATE POLICY "Team members can manage policies" ON policies
FOR ALL TO authenticated
USING (
  is_authenticated_team_member() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
)
WITH CHECK (
  is_authenticated_team_member() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
);

-- 3. Atualizar políticas RLS para installments (incluir operator)
DROP POLICY IF EXISTS "Team members can manage installments" ON installments;

CREATE POLICY "Team members can manage installments" ON installments
FOR ALL TO authenticated
USING (
  is_authenticated_team_member() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
)
WITH CHECK (
  is_authenticated_team_member() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
);

-- 4. Atualizar políticas RLS para contacts (incluir operator)
DROP POLICY IF EXISTS "Team members can manage contacts" ON contacts;

CREATE POLICY "Team members can manage contacts" ON contacts
FOR ALL TO authenticated
USING (
  is_authenticated_team_member() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
)
WITH CHECK (
  is_authenticated_team_member() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
);

-- 5. Atualizar políticas RLS para companies (incluir operator)
DROP POLICY IF EXISTS "Team members can manage companies" ON companies;

CREATE POLICY "Team members can manage companies" ON companies
FOR ALL TO authenticated
USING (
  is_authenticated_team_member() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
)
WITH CHECK (
  is_authenticated_team_member() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
);