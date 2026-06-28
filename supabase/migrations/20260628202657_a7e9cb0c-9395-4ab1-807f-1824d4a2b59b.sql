ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS rntrc text,
  ADD COLUMN IF NOT EXISTS company_type text,
  ADD COLUMN IF NOT EXISTS vehicle_plate text,
  ADD COLUMN IF NOT EXISTS vehicle_type text,
  ADD COLUMN IF NOT EXISTS cargo_type text,
  ADD COLUMN IF NOT EXISTS typical_route_km integer;

COMMENT ON COLUMN public.contacts.rntrc IS 'Registro ANTT do transportador (RNTRC)';
COMMENT ON COLUMN public.contacts.company_type IS 'Porte da empresa: MEI, ME ou EPP';
COMMENT ON COLUMN public.contacts.vehicle_plate IS 'Placa do veículo transportador';
COMMENT ON COLUMN public.contacts.vehicle_type IS 'Tipo/modelo do veículo';
COMMENT ON COLUMN public.contacts.cargo_type IS 'Tipo de carga transportada';
COMMENT ON COLUMN public.contacts.typical_route_km IS 'Rota típica em km (cálculo do RC-V)';