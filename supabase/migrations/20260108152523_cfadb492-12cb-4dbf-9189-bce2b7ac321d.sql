-- Criar tabela de empresas (segurados PJ)
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj TEXT UNIQUE NOT NULL,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  inscricao_estadual TEXT,
  inscricao_municipal TEXT,
  -- Endereço
  cep TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  -- Metadados
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Adicionar campos em contacts para vincular a empresa
ALTER TABLE public.contacts ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.contacts ADD COLUMN role TEXT;
ALTER TABLE public.contacts ADD COLUMN is_billing_contact BOOLEAN DEFAULT false;

-- Adicionar campo em policies para vincular a empresa
ALTER TABLE public.policies ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- Trigger para updated_at em companies
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_contacts_company_id ON public.contacts(company_id);
CREATE INDEX idx_contacts_is_billing ON public.contacts(is_billing_contact) WHERE is_billing_contact = true;
CREATE INDEX idx_policies_company_id ON public.policies(company_id);
CREATE INDEX idx_companies_cnpj ON public.companies(cnpj);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para companies
CREATE POLICY "Authenticated users can view companies"
  ON public.companies FOR SELECT
  USING (public.is_authenticated_user());

CREATE POLICY "Authenticated users can insert companies"
  ON public.companies FOR INSERT
  WITH CHECK (public.is_authenticated_user());

CREATE POLICY "Authenticated users can update companies"
  ON public.companies FOR UPDATE
  USING (public.is_authenticated_user());

CREATE POLICY "Authenticated users can delete companies"
  ON public.companies FOR DELETE
  USING (public.is_authenticated_user());

-- Habilitar realtime para companies
ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;