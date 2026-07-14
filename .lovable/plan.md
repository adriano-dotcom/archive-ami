# Rate limiting & abuse protection

Recommended: **Full scope** (edge functions + bridge). The bridge is the higher-risk surface (open WebSocket, live calls), but the internal functions matter too since a leaked staff JWT would otherwise have unlimited blast radius. Cost is small — one DB call per invocation.

## 1. Postgres rate limiter (shared primitive)

New table + function via migration:

- `public.rate_limit_hits(key text, window_start timestamptz, count int, primary key(key, window_start))`
- `public.check_rate_limit(_key text, _max int, _window_seconds int) returns boolean` — SECURITY DEFINER, upserts the current bucket, returns `false` when over limit.
- GRANT EXECUTE to `service_role` and `authenticated`.
- Cron/cleanup: delete rows older than 1 hour (add to existing `cleanup-queues` function).

Key format: `"<fn_name>:<subject>"` where subject is user_id if staff JWT, otherwise `ip:<x-forwarded-for>`, otherwise `service_role` (skipped — trusted).

## 2. Apply to internal edge functions

Add a small helper block (same shape as the auth guard already in place) right after the auth guard in each function. Skips the check when caller is service-role.

Limits (per subject):
- Heavy AI / send functions (`nina-orchestrator`, `whatsapp-sender`, `send-collection-*`, `analyze-conversation`, `sales-coaching-analysis`, `transcribe-call-recording`, `summarize-transcription`, `rewrite-message`, `generate-*`): **30 / minute**
- Admin/test/register/sync functions: **10 / minute**
- Call-control (`whatsapp-call-accept/reject/terminate`, `api4com-*`): **20 / minute**
- Public-facing with own secrets (`capture-lead`, `receive-ecommerce-webhook`, `jarvis-sync`, `replicate-lead-to-crm`, `whatsapp-webhook`, `whatsapp-call-webhook`): **60 / minute per IP** (defense-in-depth against flooding).

On limit exceeded → `429` with `Retry-After` header.

## 3. Bridge server (`bridge-server/server.js`)

Two-part fix — auth first (the actual security hole per the scan), then limits.

**a. Socket.IO authentication** (fixes `bridge_socketio_noauth`):
- Add `io.use(async (socket, next) => { ... })` middleware.
- Client passes `auth: { token: <supabase access_token> }` when connecting.
- Middleware calls Supabase `/auth/v1/user` with the token, then checks `user_roles` for `admin`/`operator`. Reject otherwise.
- Update `useIncomingWhatsAppCall.ts` (frontend) to pass the current session token in the Socket.IO client config, and reconnect on token refresh.

**b. Rate limiting** (in-memory Map, per socket user_id + IP):
- Connection attempts: 20 / minute per IP.
- `accept_call` / `reject_call` / `terminate_call`: 30 / minute per user.
- Reject the event and emit `rate_limited` if exceeded.

**c. REST endpoints** on the bridge (`/incoming-call`, `/sdp-offer`) already require `X-Bridge-Secret`; add a 120/min per-IP in-memory limit as defense-in-depth.

## 4. Verification

- Type-check all touched edge functions.
- `curl` an internal function past the limit → confirm `429`.
- Connect to the bridge with no token → confirm rejected. With a valid staff token → confirm accepted, incoming-call flow still works end-to-end.
- Mark `bridge_socketio_noauth` finding as fixed after deploy.

## Technical notes

- `check_rate_limit` uses `date_trunc('second', now()) - (extract(epoch from now())::int % window)` to snap to fixed buckets — simple and index-friendly.
- Service-role callers (cron, DB triggers, bridge → edge function) bypass the limiter; they're already trusted.
- Bridge in-memory limits reset on redeploy; acceptable for a single-instance Railway deploy. If we ever run multiple instances, move to Redis or the Postgres limiter.
- No changes to public webhook signature verification (Meta, HMAC secrets) — those stay as-is; rate limiting is added on top.
