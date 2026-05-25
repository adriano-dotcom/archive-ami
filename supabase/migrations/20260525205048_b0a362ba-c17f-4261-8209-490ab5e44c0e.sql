-- 1) nina-audio: remove public SELECT policies
DROP POLICY IF EXISTS "Public can read nina audio files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read nina-audio" ON storage.objects;

-- 2) webhook_request_logs: restrict INSERT to service_role only
DROP POLICY IF EXISTS "Allow service role insert" ON public.webhook_request_logs;
CREATE POLICY "Service role can insert webhook logs"
ON public.webhook_request_logs
FOR INSERT
TO service_role
WITH CHECK (true);

-- 3) Revoke EXECUTE from anon/authenticated on sensitive SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.set_vault_secret(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_vault_secret(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_vault_secret(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_message_processing_batch(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_nina_processing_batch(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_send_queue_batch(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_processed_message_queue() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_processed_queues() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_client_memory(uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_nina_orchestrator() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_whatsapp_sender() FROM anon, authenticated, public;

-- 4) Realtime channel authorization: only active team members can subscribe
DROP POLICY IF EXISTS "Authenticated team members can read realtime" ON realtime.messages;
CREATE POLICY "Authenticated team members can read realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.is_authenticated_team_member() OR public.is_authenticated_user());