
-- Tabela de apólices (policies)
CREATE TABLE public.policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  policy_number TEXT NOT NULL,
  insurer TEXT NOT NULL,
  branch TEXT,
  product TEXT,
  start_date DATE,
  end_date DATE,
  total_value NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'suspended')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de parcelas (installments)
CREATE TABLE public.installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_id UUID REFERENCES public.policies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  value NUMERIC(12,2) NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'negotiating', 'cancelled')),
  days_overdue INTEGER DEFAULT 0,
  payment_method TEXT,
  payment_reference TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de tentativas de cobrança (collection_attempts)
CREATE TABLE public.collection_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installment_id UUID REFERENCES public.installments(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  batch_id UUID,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'phone', 'sms')),
  template_name TEXT,
  message_content TEXT,
  message_id UUID REFERENCES public.messages(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de lotes de cobrança (collection_batches)
CREATE TABLE public.collection_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'phone', 'sms')),
  template_name TEXT,
  template_variables JSONB DEFAULT '{}'::jsonb,
  filters JSONB DEFAULT '{}'::jsonb,
  total_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  replied_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'processing', 'completed', 'cancelled', 'paused')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de mapeamentos de importação (para reutilizar configurações)
CREATE TABLE public.import_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  insurer TEXT,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'xlsx', 'xls', 'pdf')),
  column_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de logs de importação
CREATE TABLE public.import_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_type TEXT,
  insurer TEXT,
  mapping_id UUID REFERENCES public.import_mappings(id),
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_policies_contact_id ON public.policies(contact_id);
CREATE INDEX idx_policies_status ON public.policies(status);
CREATE INDEX idx_policies_insurer ON public.policies(insurer);

CREATE INDEX idx_installments_policy_id ON public.installments(policy_id);
CREATE INDEX idx_installments_contact_id ON public.installments(contact_id);
CREATE INDEX idx_installments_status ON public.installments(status);
CREATE INDEX idx_installments_due_date ON public.installments(due_date);
CREATE INDEX idx_installments_days_overdue ON public.installments(days_overdue);

CREATE INDEX idx_collection_attempts_installment_id ON public.collection_attempts(installment_id);
CREATE INDEX idx_collection_attempts_contact_id ON public.collection_attempts(contact_id);
CREATE INDEX idx_collection_attempts_batch_id ON public.collection_attempts(batch_id);
CREATE INDEX idx_collection_attempts_status ON public.collection_attempts(status);

CREATE INDEX idx_collection_batches_status ON public.collection_batches(status);

-- Adicionar FK do batch_id após criar a tabela
ALTER TABLE public.collection_attempts 
  ADD CONSTRAINT collection_attempts_batch_id_fkey 
  FOREIGN KEY (batch_id) REFERENCES public.collection_batches(id) ON DELETE SET NULL;

-- Triggers para updated_at
CREATE TRIGGER update_policies_updated_at
  BEFORE UPDATE ON public.policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_installments_updated_at
  BEFORE UPDATE ON public.installments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_collection_attempts_updated_at
  BEFORE UPDATE ON public.collection_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_collection_batches_updated_at
  BEFORE UPDATE ON public.collection_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_import_mappings_updated_at
  BEFORE UPDATE ON public.import_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Função para calcular dias de atraso e atualizar status
CREATE OR REPLACE FUNCTION public.calculate_installment_overdue()
RETURNS TRIGGER AS $$
BEGIN
  -- Calcular dias de atraso
  IF NEW.due_date < CURRENT_DATE AND NEW.status IN ('pending', 'overdue', 'negotiating') THEN
    NEW.days_overdue := CURRENT_DATE - NEW.due_date;
    -- Atualizar status para overdue se estava pending
    IF NEW.status = 'pending' THEN
      NEW.status := 'overdue';
    END IF;
  ELSE
    NEW.days_overdue := 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_installment_overdue_trigger
  BEFORE INSERT OR UPDATE ON public.installments
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_installment_overdue();

-- Enable RLS
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can manage policies"
  ON public.policies FOR ALL
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

CREATE POLICY "Authenticated users can manage installments"
  ON public.installments FOR ALL
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

CREATE POLICY "Authenticated users can manage collection_attempts"
  ON public.collection_attempts FOR ALL
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

CREATE POLICY "Authenticated users can manage collection_batches"
  ON public.collection_batches FOR ALL
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

CREATE POLICY "Authenticated users can manage import_mappings"
  ON public.import_mappings FOR ALL
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

CREATE POLICY "Authenticated users can manage import_logs"
  ON public.import_logs FOR ALL
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

-- View para resumo de inadimplência
CREATE OR REPLACE VIEW public.collection_summary AS
SELECT 
  COUNT(DISTINCT i.contact_id) as total_debtors,
  COUNT(i.id) as total_overdue_installments,
  COALESCE(SUM(i.value), 0) as total_overdue_value,
  COUNT(CASE WHEN i.days_overdue BETWEEN 1 AND 30 THEN 1 END) as range_1_30,
  COUNT(CASE WHEN i.days_overdue BETWEEN 31 AND 60 THEN 1 END) as range_31_60,
  COUNT(CASE WHEN i.days_overdue BETWEEN 61 AND 90 THEN 1 END) as range_61_90,
  COUNT(CASE WHEN i.days_overdue > 90 THEN 1 END) as range_90_plus,
  COALESCE(SUM(CASE WHEN i.days_overdue BETWEEN 1 AND 30 THEN i.value END), 0) as value_1_30,
  COALESCE(SUM(CASE WHEN i.days_overdue BETWEEN 31 AND 60 THEN i.value END), 0) as value_31_60,
  COALESCE(SUM(CASE WHEN i.days_overdue BETWEEN 61 AND 90 THEN i.value END), 0) as value_61_90,
  COALESCE(SUM(CASE WHEN i.days_overdue > 90 THEN i.value END), 0) as value_90_plus
FROM public.installments i
WHERE i.status IN ('overdue', 'negotiating');
