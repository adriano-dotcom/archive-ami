ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS pipedrive_person_id text,
  ADD COLUMN IF NOT EXISTS pipedrive_org_id text,
  ADD COLUMN IF NOT EXISTS pipedrive_lead_id text,
  ADD COLUMN IF NOT EXISTS pipedrive_sync_status text;

CREATE OR REPLACE FUNCTION public.is_valid_cnpj(p text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE d text := regexp_replace(coalesce(p,''), '\D', '', 'g');
  w1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; i int;
BEGIN
  IF length(d) <> 14 OR d ~ '^(\d)\1{13}$' THEN RETURN false; END IF;
  s := 0; FOR i IN 1..12 LOOP s := s + substr(d,i,1)::int * w1[i]; END LOOP;
  r := s % 11; r := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
  IF r <> substr(d,13,1)::int THEN RETURN false; END IF;
  s := 0; FOR i IN 1..13 LOOP s := s + substr(d,i,1)::int * w2[i]; END LOOP;
  r := s % 11; r := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
  RETURN r = substr(d,14,1)::int;
END $$;

CREATE OR REPLACE FUNCTION public.push_lead_pipedrive_trigger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
DECLARE
    v_secret text;
    v_qualifies boolean;
BEGIN
    v_qualifies :=
      (
        (public.is_valid_cnpj(NEW.cnpj)
          AND (TG_OP = 'INSERT' OR OLD.cnpj IS DISTINCT FROM NEW.cnpj))
        OR (NEW.lead_status IN ('proposal','customer')
          AND (TG_OP = 'INSERT' OR OLD.lead_status IS DISTINCT FROM NEW.lead_status))
      )
      AND coalesce(NEW.is_blocked, false) = false
      AND NEW.blocked_at IS NULL
      AND coalesce(NEW.lead_status, '') <> 'churned'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(NEW.tags, ARRAY[]::text[])) t
        WHERE lower(t) ~ '(desqualif|opt.?out|emprego|numero.?errado|número.?errado|engano|fornecedor|seguradora|spam)'
      )
      AND NEW.pipedrive_lead_id IS NULL
      AND coalesce(NEW.pipedrive_sync_status, '') NOT IN ('sending','sent');

    IF v_qualifies THEN
        v_secret := public.get_vault_secret('internal_cron_secret');
        IF v_secret IS NULL THEN
            RAISE WARNING '[push_lead_pipedrive] internal_cron_secret ausente no Vault';
            RETURN NEW;
        END IF;
        PERFORM net.http_post(
            url := 'https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/push-lead-pipedrive',
            headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
            body := jsonb_build_object('contact_id', NEW.id)
        );
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[push_lead_pipedrive] Erro: %', SQLERRM;
    RETURN NEW;
END;
$function$;