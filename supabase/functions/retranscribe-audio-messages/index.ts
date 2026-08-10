import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRIVATE_BUCKETS = ['whatsapp-media', 'nina-audio'];

function parseStoragePath(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

async function getElevenLabsKey(supabase: any): Promise<string | null> {
  const envKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (envKey) return envKey;

  const { data: settings } = await supabase
    .from('nina_settings')
    .select('elevenlabs_api_key, elevenlabs_key_in_vault')
    .maybeSingle();

  if (settings?.elevenlabs_key_in_vault) {
    const { data: vaultKey } = await supabase.rpc('get_vault_secret', { secret_name: 'vault_elevenlabs_key' });
    if (vaultKey) return vaultKey as string;
  }
  return settings?.elevenlabs_api_key || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

  // Auth: service role (interno) OU staff autenticado (admin/operator)
  if (token !== svcKey) {
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: authData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: roles } = await authClient.from('user_roles').select('role').eq('user_id', authData.user.id);
    if (!(roles || []).some((r: any) => r.role === 'admin' || r.role === 'operator')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  const supabase = createClient(supabaseUrl, svcKey);

  try {
    const body = await req.json().catch(() => ({}));
    const messageId: string | undefined = body.message_id;
    const limit: number = Math.min(Number(body.limit) || 5, 25);

    let query = supabase
      .from('messages')
      .select('id, content, media_url, media_type')
      .eq('media_type', 'audio')
      .order('created_at', { ascending: false });

    if (messageId) {
      query = supabase.from('messages').select('id, content, media_url, media_type').eq('id', messageId);
    } else {
      query = query.in('content', ['[áudio]', '[audio]']).limit(limit);
    }

    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows?.length) {
      return new Response(JSON.stringify({ success: true, processed: 0, results: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = await getElevenLabsKey(supabase);
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ELEVENLABS_API_KEY não configurada' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];

    for (const row of rows) {
      if (!row.media_url) {
        results.push({ id: row.id, ok: false, reason: 'sem media_url' });
        continue;
      }

      const parsed = parseStoragePath(row.media_url);
      let bytes: ArrayBuffer | null = null;
      let mimeType = 'audio/ogg';

      if (parsed && PRIVATE_BUCKETS.includes(parsed.bucket)) {
        const { data: file, error: dlErr } = await supabase.storage.from(parsed.bucket).download(parsed.path);
        if (dlErr || !file) {
          results.push({ id: row.id, ok: false, reason: `download falhou: ${dlErr?.message}` });
          continue;
        }
        bytes = await file.arrayBuffer();
        mimeType = file.type || mimeType;
      } else {
        const resp = await fetch(row.media_url);
        if (!resp.ok) {
          results.push({ id: row.id, ok: false, reason: `fetch ${resp.status}` });
          continue;
        }
        bytes = await resp.arrayBuffer();
        mimeType = resp.headers.get('content-type') || mimeType;
      }

      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mimeType }), 'audio.ogg');
      form.append('model_id', 'scribe_v1');
      form.append('language_code', 'por');

      const sttResp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
      });

      if (!sttResp.ok) {
        const errText = await sttResp.text();
        console.error('[retranscribe] ElevenLabs erro:', sttResp.status, errText);
        results.push({ id: row.id, ok: false, reason: `stt ${sttResp.status}: ${errText.slice(0, 200)}` });
        continue;
      }

      const json = await sttResp.json();
      const text = (json.text || '').trim();
      if (!text) {
        results.push({ id: row.id, ok: false, reason: 'transcrição vazia' });
        continue;
      }

      await supabase.from('messages').update({ content: text }).eq('id', row.id);
      results.push({ id: row.id, ok: true, text });
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[retranscribe] erro:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
