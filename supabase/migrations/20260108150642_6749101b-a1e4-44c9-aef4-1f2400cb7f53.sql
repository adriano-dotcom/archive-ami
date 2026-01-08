
-- Corrigir a view para usar SECURITY INVOKER
DROP VIEW IF EXISTS public.collection_summary;

CREATE VIEW public.collection_summary 
WITH (security_invoker = true)
AS
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

-- Corrigir a função para ter search_path definido
CREATE OR REPLACE FUNCTION public.calculate_installment_overdue()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
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
$$;
