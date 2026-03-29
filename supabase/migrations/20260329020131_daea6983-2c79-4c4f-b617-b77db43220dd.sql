-- Ecommerce orders audit table
CREATE TABLE public.ecommerce_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  order_id text NOT NULL,
  event_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ecommerce_orders_order_id ON public.ecommerce_orders(order_id);
CREATE INDEX idx_ecommerce_orders_contact_id ON public.ecommerce_orders(contact_id);

ALTER TABLE public.ecommerce_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ecommerce_orders"
  ON public.ecommerce_orders FOR SELECT TO authenticated
  USING (is_authenticated_user());

CREATE POLICY "Authenticated users can insert ecommerce_orders"
  ON public.ecommerce_orders FOR INSERT TO authenticated
  WITH CHECK (is_authenticated_user());