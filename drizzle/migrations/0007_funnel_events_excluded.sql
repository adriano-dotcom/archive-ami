ALTER TABLE public.lead_funnel_events ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.origem_funil WITH (security_invoker = on) AS
WITH per_contact AS (
  SELECT c.id, c.created_at, c.cnpj, c.lead_status, c.sent_to_pipedrive_at, c.pipedrive_sync_status, c.pipedrive_sync_error,
    la.*,
    (SELECT count(DISTINCT e.pipedrive_deal_id) FROM public.lead_funnel_events e WHERE e.contact_id = c.id AND e.event_type = 'deal_open' AND NOT e.excluded)::int AS n_neg,
    (SELECT count(DISTINCT e.pipedrive_deal_id) FROM public.lead_funnel_events e WHERE e.contact_id = c.id AND e.event_type = 'deal_won' AND NOT e.excluded)::int AS n_won,
    (SELECT coalesce(sum(e.deal_value), 0) FROM public.lead_funnel_events e WHERE e.contact_id = c.id AND e.event_type = 'deal_won' AND NOT e.excluded) AS v_won
  FROM public.contacts c
  LEFT JOIN LATERAL (SELECT l.first_canal, l.first_utm_source, l.first_utm_campaign, l.first_utm_content, l.first_campaign, l.first_meta_ad_id,
                            l.last_canal, l.last_utm_source, l.last_utm_campaign, l.last_utm_content, l.last_campaign, l.last_meta_ad_id
                     FROM public.lead_attribution l WHERE l.contact_id = c.id) la ON true
),
base AS (
  SELECT 'last'::text AS modo, coalesce(last_canal, 'Direto') AS canal,
    coalesce(last_utm_campaign, last_campaign) AS campanha_id,
    coalesce(last_meta_ad_id, CASE WHEN coalesce(last_canal,'') = 'Meta' THEN last_utm_content END) AS anuncio_id,
    per_contact.* FROM per_contact
  UNION ALL
  SELECT 'first', coalesce(first_canal, 'Direto'),
    coalesce(first_utm_campaign, first_campaign),
    coalesce(first_meta_ad_id, CASE WHEN coalesce(first_canal,'') = 'Meta' THEN first_utm_content END),
    per_contact.* FROM per_contact
)
SELECT b.canal, b.campanha_id,
  coalesce(ma_c.campanha_nome, ma.campanha_nome) AS campanha_nome,
  b.anuncio_id, ma.nome AS anuncio_nome,
  date_trunc('week', b.created_at)::date AS semana,
  count(*)::int AS contatos,
  count(*) FILTER (WHERE public.is_valid_cnpj(b.cnpj))::int AS com_cnpj,
  count(*) FILTER (WHERE b.lead_status = 'proposal')::int AS em_proposta,
  count(*) FILTER (WHERE b.lead_status = 'customer')::int AS clientes,
  count(*) FILTER (WHERE b.sent_to_pipedrive_at IS NOT NULL)::int AS enviados_pipedrive,
  count(*) FILTER (WHERE b.pipedrive_sync_status = 'failed' OR (b.pipedrive_sync_error IS NOT NULL AND b.sent_to_pipedrive_at IS NULL))::int AS erro_pipedrive,
  sum(b.n_neg)::int AS negocios,
  sum(b.n_won)::int AS ganhos,
  sum(b.v_won)::numeric AS valor_ganho,
  round(sum(b.n_won)::numeric / nullif(count(*), 0), 4) AS taxa_ganho,
  b.modo
FROM base b
LEFT JOIN public.meta_ads ma ON ma.id = b.anuncio_id
LEFT JOIN LATERAL (SELECT m.campanha_nome FROM public.meta_ads m WHERE m.campanha_id = b.campanha_id LIMIT 1) ma_c ON true
GROUP BY b.modo, b.canal, b.campanha_id, coalesce(ma_c.campanha_nome, ma.campanha_nome), b.anuncio_id, ma.nome, date_trunc('week', b.created_at)::date;