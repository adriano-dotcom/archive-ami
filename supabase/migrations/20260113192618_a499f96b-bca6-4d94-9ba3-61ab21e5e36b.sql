-- 1. DROP políticas antigas
DROP POLICY IF EXISTS "conversations_select_policy" ON conversations;
DROP POLICY IF EXISTS "conversations_update_policy" ON conversations;

-- 2. Criar nova política SELECT simplificada
-- Todos os team members autenticados podem ver TODAS as conversas
CREATE POLICY "conversations_select_policy"
ON conversations FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_authenticated_team_member()
);

-- 3. Criar nova política UPDATE simplificada
-- Todos os team members autenticados podem atualizar conversas
CREATE POLICY "conversations_update_policy"
ON conversations FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_authenticated_team_member()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_authenticated_team_member()
);