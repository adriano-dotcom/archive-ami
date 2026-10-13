-- Canal único (Meta/Google/Vendedor/Direto)
CREATE OR REPLACE FUNCTION public.lead_channel(p_utm_source text, p_meta_ad_id text, p_ctwa_clid text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN lower(coalesce(p_utm_source,'')) IN ('facebook','fb','ig','instagram','meta','meta_ctwa')
         OR p_meta_ad_id IS NOT NULL OR p_ctwa_clid IS NOT NULL THEN 'Meta'
    WHEN lower(coalesce(p_utm_source,'')) IN ('google','gads','adwords') THEN 'Google'
    WHEN lower(coalesce(p_utm_source,'')) = 'vendedor' THEN 'Vendedor'
    ELSE 'Direto' END
$$;

CREATE TABLE IF NOT EXISTS public.lead_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL UNIQUE REFERENCES public.contacts(id) ON DELETE CASCADE,
  first_canal text, first_utm_source text, first_utm_campaign text, first_utm_content text, first_utm_term text,
  first_campaign text, first_meta_ad_id text, first_ctwa_clid text, first_referral_headline text, first_gclid text,
  last_canal text, last_utm_source text, last_utm_campaign text, last_utm_content text, last_utm_term text,
  last_campaign text, last_meta_ad_id text, last_ctwa_clid text, last_referral_headline text, last_gclid text,
  first_at timestamptz, last_at timestamptz,
  touches integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_attribution TO authenticated;
GRANT ALL ON public.lead_attribution TO service_role;
ALTER TABLE public.lead_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe lê atribuição" ON public.lead_attribution FOR SELECT TO authenticated USING (public.is_authenticated_user());

CREATE OR REPLACE FUNCTION public.upsert_lead_attribution(p_contact_id uuid, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_canal text;
  v_has boolean;
BEGIN
  v_has := coalesce(p->>'utm_source', p->>'utm_campaign', p->>'utm_content', p->>'utm_term', p->>'campaign',
                    p->>'meta_ad_id', p->>'ctwa_clid', p->>'referral_headline', p->>'gclid') IS NOT NULL;
  v_canal := public.lead_channel(p->>'utm_source', p->>'meta_ad_id', p->>'ctwa_clid');
  IF v_canal = 'Direto' AND p->>'gclid' IS NOT NULL THEN v_canal := 'Google'; END IF;

  INSERT INTO public.lead_attribution AS la (contact_id, touches) VALUES (p_contact_id, 0)
  ON CONFLICT (contact_id) DO NOTHING;

  IF NOT v_has THEN
    UPDATE public.lead_attribution SET touches = touches + 1, updated_at = now() WHERE contact_id = p_contact_id;
    RETURN;
  END IF;

  UPDATE public.lead_attribution la SET
    first_canal = CASE WHEN la.first_at IS NULL THEN v_canal ELSE la.first_canal END,
    first_utm_source = CASE WHEN la.first_at IS NULL THEN p->>'utm_source' ELSE la.first_utm_source END,
    first_utm_campaign = CASE WHEN la.first_at IS NULL THEN p->>'utm_campaign' ELSE la.first_utm_campaign END,
    first_utm_content = CASE WHEN la.first_at IS NULL THEN p->>'utm_content' ELSE la.first_utm_content END,
    first_utm_term = CASE WHEN la.first_at IS NULL THEN p->>'utm_term' ELSE la.first_utm_term END,
    first_campaign = CASE WHEN la.first_at IS NULL THEN p->>'campaign' ELSE la.first_campaign END,
    first_meta_ad_id = CASE WHEN la.first_at IS NULL THEN p->>'meta_ad_id' ELSE la.first_meta_ad_id END,
    first_ctwa_clid = CASE WHEN la.first_at IS NULL THEN p->>'ctwa_clid' ELSE la.first_ctwa_clid END,
    first_referral_headline = CASE WHEN la.first_at IS NULL THEN p->>'referral_headline' ELSE la.first_referral_headline END,
    first_gclid = CASE WHEN la.first_at IS NULL THEN p->>'gclid' ELSE la.first_gclid END,
    first_at = coalesce(la.first_at, now()),
    last_canal = v_canal,
    last_utm_source = p->>'utm_source', last_utm_campaign = p->>'utm_campaign', last_utm_content = p->>'utm_content',
    last_utm_term = p->>'utm_term', last_campaign = p->>'campaign', last_meta_ad_id = p->>'meta_ad_id',
    last_ctwa_clid = p->>'ctwa_clid', last_referral_headline = p->>'referral_headline', last_gclid = p->>'gclid',
    last_at = now(),
    touches = la.touches + 1,
    updated_at = now()
  WHERE la.contact_id = p_contact_id;
END $$;
REVOKE ALL ON FUNCTION public.upsert_lead_attribution(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_lead_attribution(uuid, jsonb) TO service_role;

-- Backfill atribuição (first = last)
INSERT INTO public.lead_attribution (contact_id,
  first_canal, first_utm_source, first_utm_campaign, first_utm_content, first_utm_term, first_campaign, first_meta_ad_id, first_ctwa_clid, first_referral_headline,
  last_canal, last_utm_source, last_utm_campaign, last_utm_content, last_utm_term, last_campaign, last_meta_ad_id, last_ctwa_clid, last_referral_headline,
  first_at, last_at, touches)
SELECT c.id,
  public.lead_channel(c.utm_source, c.meta_ad_id, c.ctwa_clid), c.utm_source, c.utm_campaign, c.utm_content, c.utm_term, c.campaign, c.meta_ad_id, c.ctwa_clid, c.referral_headline,
  public.lead_channel(c.utm_source, c.meta_ad_id, c.ctwa_clid), c.utm_source, c.utm_campaign, c.utm_content, c.utm_term, c.campaign, c.meta_ad_id, c.ctwa_clid, c.referral_headline,
  CASE WHEN has_o THEN coalesce(c.first_contact_date, c.created_at) END,
  CASE WHEN has_o THEN coalesce(c.first_contact_date, c.created_at) END,
  CASE WHEN has_o THEN 1 ELSE 0 END
FROM (SELECT *, coalesce(utm_source, utm_campaign, utm_content, campaign, meta_ad_id, ctwa_clid, referral_headline) IS NOT NULL AS has_o FROM public.contacts) c
ON CONFLICT (contact_id) DO NOTHING;

-- Eventos de funil (append-only)
CREATE TABLE IF NOT EXISTS public.lead_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  fingerprint text NOT NULL UNIQUE,
  canal text, utm_campaign text, utm_content text, meta_ad_id text, campaign text,
  pipedrive_person_id text, pipedrive_lead_id text, pipedrive_deal_id text,
  deal_value numeric, deal_pipeline_id integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lfe_contact ON public.lead_funnel_events(contact_id, event_type);
GRANT SELECT ON public.lead_funnel_events TO authenticated;
GRANT ALL ON public.lead_funnel_events TO service_role;
ALTER TABLE public.lead_funnel_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe lê eventos de funil" ON public.lead_funnel_events FOR SELECT TO authenticated USING (public.is_authenticated_user());

CREATE OR REPLACE FUNCTION public.record_funnel_event(p_contact_id uuid, p_event_type text, p_occurred_at timestamptz, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  e jsonb := coalesce(p_extra, '{}'::jsonb);
  la public.lead_attribution;
  c public.contacts;
  n int;
BEGIN
  SELECT * INTO la FROM public.lead_attribution WHERE contact_id = p_contact_id;
  SELECT * INTO c FROM public.contacts WHERE id = p_contact_id;
  INSERT INTO public.lead_funnel_events (contact_id, event_type, occurred_at, fingerprint,
    canal, utm_campaign, utm_content, meta_ad_id, campaign,
    pipedrive_person_id, pipedrive_lead_id, pipedrive_deal_id, deal_value, deal_pipeline_id, metadata)
  VALUES (p_contact_id, p_event_type, coalesce(p_occurred_at, now()),
    p_contact_id::text || '|' || p_event_type || '|' || coalesce(e->>'key', ''),
    coalesce(la.last_canal, 'Direto'), la.last_utm_campaign, la.last_utm_content, la.last_meta_ad_id, la.last_campaign,
    coalesce(e->>'pipedrive_person_id', c.pipedrive_person_id), coalesce(e->>'pipedrive_lead_id', c.pipedrive_lead_id),
    coalesce(e->>'pipedrive_deal_id', c.pipedrive_deal_id),
    nullif(e->>'deal_value','')::numeric, nullif(e->>'deal_pipeline_id','')::int,
    coalesce(e->'metadata', '{}'::jsonb))
  ON CONFLICT (fingerprint) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.record_funnel_event(uuid, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_funnel_event(uuid, text, timestamptz, jsonb) TO service_role;

-- Trigger de eventos em contacts
CREATE OR REPLACE FUNCTION public.contacts_funnel_events_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_attribution (contact_id, first_canal, first_utm_source, first_utm_campaign, first_utm_content, first_utm_term, first_campaign, first_meta_ad_id, first_ctwa_clid, first_referral_headline,
      last_canal, last_utm_source, last_utm_campaign, last_utm_content, last_utm_term, last_campaign, last_meta_ad_id, last_ctwa_clid, last_referral_headline, touches)
    VALUES (NEW.id, public.lead_channel(NEW.utm_source, NEW.meta_ad_id, NEW.ctwa_clid), NEW.utm_source, NEW.utm_campaign, NEW.utm_content, NEW.utm_term, NEW.campaign, NEW.meta_ad_id, NEW.ctwa_clid, NEW.referral_headline,
      public.lead_channel(NEW.utm_source, NEW.meta_ad_id, NEW.ctwa_clid), NEW.utm_source, NEW.utm_campaign, NEW.utm_content, NEW.utm_term, NEW.campaign, NEW.meta_ad_id, NEW.ctwa_clid, NEW.referral_headline, 0)
    ON CONFLICT (contact_id) DO NOTHING;
    PERFORM public.record_funnel_event(NEW.id, 'lead_received', coalesce(NEW.first_contact_date, NEW.created_at), '{}'::jsonb);
  END IF;

  IF public.is_valid_cnpj(NEW.cnpj) AND (TG_OP = 'INSERT' OR OLD.cnpj IS DISTINCT FROM NEW.cnpj) THEN
    PERFORM public.record_funnel_event(NEW.id, 'cnpj_received', now(), jsonb_build_object('key', regexp_replace(NEW.cnpj, '\D', '', 'g')));
  END IF;
  IF NEW.lead_status IN ('proposal','customer') AND (TG_OP = 'INSERT' OR OLD.lead_status IS DISTINCT FROM NEW.lead_status) THEN
    PERFORM public.record_funnel_event(NEW.id, NEW.lead_status, now(), '{}'::jsonb);
  END IF;
  IF NEW.pipedrive_sync_status = 'sent' AND (TG_OP = 'INSERT' OR OLD.pipedrive_sync_status IS DISTINCT FROM 'sent') THEN
    PERFORM public.record_funnel_event(NEW.id, 'sent_to_pipedrive', coalesce(NEW.sent_to_pipedrive_at, now()), '{}'::jsonb);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[contacts_funnel_events] %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contacts_funnel_events ON public.contacts;
CREATE TRIGGER trg_contacts_funnel_events AFTER INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_funnel_events_trigger();

-- Backfill de eventos
SELECT public.record_funnel_event(id, 'lead_received', coalesce(first_contact_date, created_at), '{}'::jsonb) FROM public.contacts;
SELECT public.record_funnel_event(id, 'cnpj_received', coalesce(first_contact_date, created_at), jsonb_build_object('key', regexp_replace(cnpj, '\D', '', 'g')))
  FROM public.contacts WHERE public.is_valid_cnpj(cnpj);
SELECT public.record_funnel_event(id, lead_status, updated_at, '{}'::jsonb) FROM public.contacts WHERE lead_status IN ('proposal','customer');
SELECT public.record_funnel_event(id, 'sent_to_pipedrive', sent_to_pipedrive_at, '{}'::jsonb) FROM public.contacts WHERE sent_to_pipedrive_at IS NOT NULL;

-- View do painel (colunas novas no fim; modo = last/first)
CREATE OR REPLACE VIEW public.origem_funil WITH (security_invoker = on) AS
WITH per_contact AS (
  SELECT c.id, c.created_at, c.cnpj, c.lead_status, c.sent_to_pipedrive_at, c.pipedrive_sync_status, c.pipedrive_sync_error,
    la.*,
    (SELECT count(DISTINCT e.pipedrive_deal_id) FROM public.lead_funnel_events e WHERE e.contact_id = c.id AND e.event_type = 'deal_open')::int AS n_neg,
    (SELECT count(DISTINCT e.pipedrive_deal_id) FROM public.lead_funnel_events e WHERE e.contact_id = c.id AND e.event_type = 'deal_won')::int AS n_won,
    (SELECT coalesce(sum(e.deal_value), 0) FROM public.lead_funnel_events e WHERE e.contact_id = c.id AND e.event_type = 'deal_won') AS v_won
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
GRANT SELECT ON public.origem_funil TO authenticated;