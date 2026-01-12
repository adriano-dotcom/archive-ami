-- Remover política atual de SELECT
DROP POLICY IF EXISTS conversations_select_policy ON conversations;

-- Criar nova política com visibilidade para atendimentos humanos
CREATE POLICY conversations_select_policy ON conversations
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    (is_authenticated_team_member() AND (
      -- Conversa atribuída ao usuário atual
      (assigned_user_id = get_current_team_member_id()) OR 
      -- Conversa com time atribuído (visível para todos do time)
      (assigned_team IS NOT NULL) OR 
      -- Conversa sem atribuição
      ((assigned_user_id IS NULL) AND (assigned_team IS NULL)) OR
      -- NOVA: Conversa em atendimento humano (visível para toda equipe)
      (status = 'human')
    ))
  );

-- Atualizar política de UPDATE para permitir interação
DROP POLICY IF EXISTS conversations_update_policy ON conversations;

CREATE POLICY conversations_update_policy ON conversations
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    (is_authenticated_team_member() AND (
      (assigned_user_id = get_current_team_member_id()) OR 
      (assigned_team IS NOT NULL) OR 
      ((assigned_user_id IS NULL) AND (assigned_team IS NULL)) OR
      (status = 'human')
    ))
  )
  WITH CHECK (
    is_authenticated_team_member() OR has_role(auth.uid(), 'admin'::app_role)
  );