# Secure internal automation edge functions

## Problem
19 backend edge functions run with `verify_jwt = false` and have **no auth check** in code, so anyone with the public function URL can invoke them. This lets an attacker rack up AI/WhatsApp/email costs, send real messages to customers, and control live WhatsApp calls — all with no credentials.

The fix already exists elsewhere in the codebase (`whatsapp-sender`, `analyze-conversation`): a guard that accepts **either** the service-role bearer token (used by cron jobs, DB triggers, and the bridge server) **or** a logged-in staff session with `admin`/`operator` role, and rejects everyone else with 401/403.

## Approach
Add the same guard, right after the `OPTIONS`/CORS handling, to every function below. The guard is intentionally uniform so it works for all callers:
- Cron jobs, DB triggers (`trigger_nina_orchestrator`, `trigger_whatsapp_sender`), and the bridge server already send `Authorization: Bearer <SERVICE_ROLE_KEY>` → pass.
- The frontend (`IncomingCallModal`, `ActiveCallIndicator`, admin Settings panels) calls via `supabase.functions.invoke`, which forwards the user's session JWT → verified as a staff user with `admin`/`operator` role.
- Everyone else → `401 Unauthorized` / `403 Forbidden`.

No database changes, no config changes, no frontend changes are required — all current callers already send a valid credential.

## Guard snippet (inserted near the top of each `serve` handler)
```ts
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
if (token !== svcKey) {
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData, error: authErr } = await authClient.auth.getUser();
  if (authErr || !authData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { data: roleRows } = await authClient.from('user_roles').select('role').eq('user_id', authData.user.id);
  if (!(roleRows || []).some((r: any) => r.role === 'admin' || r.role === 'operator')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
```
Each function is adapted to its existing structure (it already creates a service-role client and imports `createClient`); the guard is placed before any side-effecting work.

## Functions to secure (all 19)
**Cron / trigger only** (reached via service role): `nina-orchestrator`, `trigger-nina-orchestrator`, `trigger-whatsapp-sender`, `process-followups`, `process-scheduled-emails`, `cleanup-queues`, `send-daily-callbacks`, `transcribe-call-recording`

**Admin / test actions** (reached via staff session): `register-whatsapp-number`, `whatsapp-subscribe-webhook`, `whatsapp-webhook-health`, `sync-whatsapp-templates`, `redownload-documents`, `test-elevenlabs-tts`, `test-qualification-email`

**Call control** (reached via bridge server service role *and* staff session): `api4com-hangup`, `whatsapp-call-accept`, `whatsapp-call-reject`, `whatsapp-call-terminate`

## Explicitly NOT touched
- `whatsapp-webhook` and `whatsapp-call-webhook` — public webhooks from Meta that must stay open (they have their own verification). Not in scope.
- `capture-lead`, `receive-ecommerce-webhook`, `jarvis-sync`, `replicate-lead-to-crm` — external-facing endpoints with their own secret/HMAC checks. Not in scope.

## Verification
1. Type-check and deploy all 19 functions.
2. Confirm an unauthenticated `curl` to one function (e.g. `cleanup-queues`) now returns `401`.
3. Confirm a service-role-authenticated call still returns `200` (cron/trigger path).
4. Confirm the in-app incoming-call flow (accept/reject/terminate/hangup) still works from the logged-in UI (staff-session path).

## Note on the second finding
The security panel also lists `bridge_socketio_noauth` (the bridge Socket.IO server accepts unauthenticated WebSocket connections). That is a separate finding in a different codebase (`bridge-server/`) and is **not** part of this request. I can tackle it in a follow-up if you want.
