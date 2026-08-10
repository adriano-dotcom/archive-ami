import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CacheEntry = { at: number; payload: unknown };
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveApiKey(supabase: any): Promise<string | null> {
  const envKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (envKey) return envKey;

  const { data: settings } = await supabase
    .from('nina_settings')
    .select('elevenlabs_api_key, elevenlabs_key_in_vault')
    .maybeSingle();

  if (settings?.elevenlabs_key_in_vault) {
    try {
      const { data: vaultKey } = await supabase.rpc('get_vault_secret', { secret_name: 'vault_elevenlabs_key' });
      if (vaultKey) return vaultKey as string;
    } catch (_e) {
      // ignore and fall back to table
    }
  }
  return settings?.elevenlabs_api_key ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // --- Auth guard: service-role OR authenticated staff (admin/operator) ---
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (token !== svcKey) {
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: authData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: roleRows } = await authClient.from('user_roles').select('role').eq('user_id', authData.user.id);
    if (!(roleRows || []).some((r: any) => r.role === 'admin' || r.role === 'operator')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  try {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cache.payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, svcKey);
    const apiKey = await resolveApiKey(supabase);
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ElevenLabs não configurada' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const [voicesRes, modelsRes] = await Promise.all([
      fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } }),
      fetch('https://api.elevenlabs.io/v1/models', { headers: { 'xi-api-key': apiKey } }),
    ]);

    if (!voicesRes.ok) {
      const body = await voicesRes.text();
      console.error(`[elevenlabs-voices] voices failed [${voicesRes.status}]: ${body}`);
      return new Response(JSON.stringify({ error: 'Falha ao listar vozes', status: voicesRes.status, details: body }), { status: voicesRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const voicesJson = await voicesRes.json();
    const voices = (voicesJson?.voices || []).map((v: any) => ({
      id: v.voice_id,
      name: v.name,
      description: [v.labels?.gender, v.labels?.accent, v.labels?.description].filter(Boolean).join(', '),
      preview_url: v.preview_url || null,
      category: v.category || null,
    }));

    let models: Array<{ id: string; name: string }> = [];
    if (modelsRes.ok) {
      const modelsJson = await modelsRes.json();
      models = (Array.isArray(modelsJson) ? modelsJson : [])
        .filter((m: any) => m?.can_do_text_to_speech !== false)
        .map((m: any) => ({ id: m.model_id, name: m.name || m.model_id }));
    } else {
      const body = await modelsRes.text();
      console.error(`[elevenlabs-voices] models failed [${modelsRes.status}]: ${body}`);
    }

    const payload = { voices, models };
    cache = { at: Date.now(), payload };

    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[elevenlabs-voices] error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
