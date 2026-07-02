-- =========================================================
-- 1. webhook_request_logs: restrict read to admin/operator
-- =========================================================
DROP POLICY IF EXISTS "Allow authenticated read" ON public.webhook_request_logs;

CREATE POLICY "Admins and operators can read webhook logs"
ON public.webhook_request_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'operator')
);

-- =========================================================
-- 2. whatsapp-media storage: restrict writes to admin/operator
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can upload to whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update whatsapp-media" ON storage.objects;

CREATE POLICY "Team can upload to whatsapp-media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
);

CREATE POLICY "Team can update whatsapp-media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
)
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
);

-- =========================================================
-- 3. SECURITY DEFINER functions: lock down EXECUTE
-- =========================================================

-- Group A: action / background functions -> service_role only (called by edge functions)
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.claim_message_processing_batch(integer)',
    'public.claim_nina_processing_batch(integer)',
    'public.claim_send_queue_batch(integer)',
    'public.get_or_create_conversation_state(uuid)',
    'public.update_conversation_state(uuid, text, text, jsonb)',
    'public.update_client_memory(uuid, jsonb)',
    'public.get_vault_secret(text)',
    'public.set_vault_secret(text, text)',
    'public.has_vault_secret(text)',
    'public.delete_vault_secret(text)',
    'public.is_whatsapp_window_open(uuid)'
  ]) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn);
  END LOOP;
END $$;

-- Group B: trigger functions -> no direct EXECUTE for anyone (triggers fire regardless)
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.handle_new_user()',
    'public.handle_new_user_role()',
    'public.increment_conversation_unread()',
    'public.increment_media_send_count()',
    'public.notify_lead_proposal()',
    'public.recalc_conversation_unread()',
    'public.sync_contact_company_data()',
    'public.trigger_nina_orchestrator()',
    'public.trigger_whatsapp_sender()',
    'public.update_whatsapp_window()'
  ]) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn);
  END LOOP;
END $$;

-- Group C: RLS helper functions -> keep authenticated (required by policies), remove anon
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.has_role(uuid, app_role)',
    'public.is_authenticated_user()',
    'public.is_authenticated_team_member()',
    'public.auth_email()',
    'public.get_current_team_member_id()'
  ]) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', fn);
  END LOOP;
END $$;