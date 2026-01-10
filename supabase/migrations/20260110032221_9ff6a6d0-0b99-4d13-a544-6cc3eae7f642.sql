-- Parte 1: Adicionar João Pedro à tabela user_roles com role 'operator'
INSERT INTO public.user_roles (user_id, role)
VALUES ('35fea5ea-0cf1-48ae-a5d6-86da397850d2', 'operator')
ON CONFLICT (user_id, role) DO NOTHING;

-- Parte 2: Criar função para adicionar role padrão automaticamente a novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'operator')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger que dispara após criação de usuário
DROP TRIGGER IF EXISTS on_auth_user_created_add_role ON auth.users;
CREATE TRIGGER on_auth_user_created_add_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();