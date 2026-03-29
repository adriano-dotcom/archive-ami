

## Fix mission-control-data 401 Error

### Diagnosis
- `supabase/config.toml` already has `verify_jwt = false` for `mission-control-data` — config is correct.
- `index.ts` already validates `BRIDGE_SECRET` manually via `Deno.env.get("BRIDGE_SECRET")` — code is correct.
- The `BRIDGE_SECRET` secret exists in the project.
- **Most likely cause**: The function needs a fresh deploy to pick up the latest config/code, OR there's a token parsing issue (no `.trim()`).

### Changes

**1. Harden token parsing in `supabase/functions/mission-control-data/index.ts`**
- Add `.trim()` to both the secret and the extracted token to eliminate invisible characters.
- Make `Bearer` parsing case-insensitive.
- Add `x-bridge-secret` header as fallback.
- Add safe debug logging (token lengths only, no values).

**2. Redeploy the function**
- Use the deploy tool to ensure the latest code + config are live.

**3. Test the endpoint**
- Invoke the function with the correct BRIDGE_SECRET to confirm 200 response.

### No database changes needed.

