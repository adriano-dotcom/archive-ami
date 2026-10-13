CREATE TABLE public.meta_ads (
  id text PRIMARY KEY,
  nome text,
  campanha_id text,
  campanha_nome text,
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.meta_ads TO authenticated;
GRANT ALL ON public.meta_ads TO service_role;
ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view meta_ads" ON public.meta_ads
  FOR SELECT TO authenticated USING (public.is_authenticated_user());

INSERT INTO public.meta_ads (id, nome, campanha_id, campanha_nome) VALUES
('52651473360877','Ad05 cartão de preço','52651472756677','Combo 3 seguros (Vendas)'),
('52651473817877','Ad08 subcontratado','52651472756677','Combo 3 seguros (Vendas)'),
('52657029211477','Ad14 identidade PR','52651472756677','Combo 3 seguros (Vendas)'),
('52657029222477','Ad15 identidade SC','52651472756677','Combo 3 seguros (Vendas)'),
('52657029228277','Ad16 identidade RS','52651472756677','Combo 3 seguros (Vendas)'),
('52657029239077','Ad17 identidade MG','52651472756677','Combo 3 seguros (Vendas)'),
('52657029282077','Ad18 renovação RNTRC','52651472756677','Combo 3 seguros (Vendas)');

CREATE VIEW public.origem_funil WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    CASE
      WHEN lower(c.utm_source) IN ('facebook','fb','ig','instagram') OR c.meta_ad_id IS NOT NULL OR c.ctwa_clid IS NOT NULL THEN 'Meta'
      WHEN lower(c.utm_source) = 'google' THEN 'Google'
      WHEN lower(c.utm_source) = 'vendedor' THEN 'Vendedor'
      ELSE coalesce(c.utm_source, 'Direto')
    END AS canal,
    coalesce(c.utm_campaign, c.campaign) AS campanha_id,
    coalesce(c.meta_ad_id, CASE WHEN lower(c.utm_source) IN ('facebook','fb','ig','instagram') THEN c.utm_content END) AS anuncio_id,
    date_trunc('week', c.created_at)::date AS semana,
    c.cnpj, c.lead_status
  FROM public.contacts c
)
SELECT b.canal, b.campanha_id, coalesce(ma_c.campanha_nome, ma.campanha_nome) AS campanha_nome,
  b.anuncio_id, ma.nome AS anuncio_nome, b.semana,
  count(*)::int AS contatos,
  count(*) FILTER (WHERE length(regexp_replace(coalesce(b.cnpj,''), '\D', '', 'g')) = 14)::int AS com_cnpj,
  count(*) FILTER (WHERE b.lead_status = 'proposal')::int AS em_proposta,
  count(*) FILTER (WHERE b.lead_status = 'customer')::int AS clientes,
  0::int AS enviados_pipedrive,
  0::int AS erro_pipedrive
FROM base b
LEFT JOIN public.meta_ads ma ON ma.id = b.anuncio_id
LEFT JOIN LATERAL (SELECT campanha_nome FROM public.meta_ads WHERE campanha_id = b.campanha_id LIMIT 1) ma_c ON true
GROUP BY 1,2,3,4,5,6;
GRANT SELECT ON public.origem_funil TO authenticated;
GRANT SELECT ON public.origem_funil TO service_role;