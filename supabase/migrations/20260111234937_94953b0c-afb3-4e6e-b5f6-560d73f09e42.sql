-- Create installment_history table for auditing changes
CREATE TABLE public.installment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installment_id UUID REFERENCES public.installments(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'marked_paid', 'marked_overdue', 'status_changed', 'deleted', 'value_changed'
  previous_status TEXT,
  new_status TEXT,
  previous_value NUMERIC,
  new_value NUMERIC,
  previous_paid_at TIMESTAMPTZ,
  new_paid_at TIMESTAMPTZ,
  performed_by UUID,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  can_revert BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_installment_history_installment_id ON public.installment_history(installment_id);
CREATE INDEX idx_installment_history_performed_at ON public.installment_history(performed_at DESC);
CREATE INDEX idx_installment_history_action ON public.installment_history(action);

-- Enable RLS
ALTER TABLE public.installment_history ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to view history
CREATE POLICY "Authenticated users can view installment history"
ON public.installment_history
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert history
CREATE POLICY "Authenticated users can create installment history"
ON public.installment_history
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create function to log installment changes automatically
CREATE OR REPLACE FUNCTION public.log_installment_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.installment_history (
      installment_id,
      action,
      previous_status,
      new_status,
      previous_value,
      new_value,
      previous_paid_at,
      new_paid_at,
      notes,
      metadata
    ) VALUES (
      NEW.id,
      CASE 
        WHEN NEW.status = 'paid' THEN 'marked_paid'
        WHEN NEW.status = 'overdue' THEN 'marked_overdue'
        WHEN NEW.status = 'negotiating' THEN 'marked_negotiating'
        ELSE 'status_changed'
      END,
      OLD.status,
      NEW.status,
      OLD.value,
      NEW.value,
      OLD.paid_at,
      NEW.paid_at,
      NULL,
      jsonb_build_object('days_overdue_before', OLD.days_overdue, 'days_overdue_after', NEW.days_overdue)
    );
  -- Log value changes (only if status didn't change)
  ELSIF OLD.value IS DISTINCT FROM NEW.value THEN
    INSERT INTO public.installment_history (
      installment_id,
      action,
      previous_status,
      new_status,
      previous_value,
      new_value,
      notes
    ) VALUES (
      NEW.id,
      'value_changed',
      OLD.status,
      NEW.status,
      OLD.value,
      NEW.value,
      NULL
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic logging
CREATE TRIGGER installment_audit_trigger
AFTER UPDATE ON public.installments
FOR EACH ROW
EXECUTE FUNCTION public.log_installment_change();

-- Enable realtime for history table
ALTER PUBLICATION supabase_realtime ADD TABLE public.installment_history;