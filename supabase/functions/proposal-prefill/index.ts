import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get('token') || '').trim();

    // Token: 32 hex chars gerados pelo nina-orchestrator
    if (!/^[a-f0-9]{32}$/i.test(token)) {
      return json({ error: 'Token inválido' }, 400);
    }

    // Rate limit por IP (proteção contra varredura de tokens)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';
    const { data: allowed } = await supabase.rpc('check_rate_limit', {
      _key: `proposal-prefill:${ip}`,
      _max: 30,
      _window_seconds: 60,
    });
    if (allowed === false) {
      return json({ error: 'Muitas requisições. Tente novamente em instantes.' }, 429);
    }

    const { data: draft, error } = await supabase
      .from('proposal_drafts')
      .select(
        'id, cnpj, razao_social, rntrc, rntrc_situacao, endereco, responsavel, cpf, email, telefone, seguro_vigente, status, expires_at',
      )
      .eq('token', token)
      .maybeSingle();

    if (error) throw error;
    if (!draft) return json({ error: 'Proposta não encontrada' }, 404);

    if (new Date(draft.expires_at).getTime() < Date.now()) {
      return json({ error: 'Link expirado' }, 410);
    }
    if (draft.status === 'transmitted') {
      return json({ error: 'Proposta já transmitida' }, 409);
    }

    // Marca a primeira abertura (não bloqueia a resposta)
    if (draft.status === 'awaiting_acceptance') {
      supabase
        .from('proposal_drafts')
        .update({ status: 'opened', opened_at: new Date().toISOString() })
        .eq('id', draft.id)
        .then(() => {}, () => {});
    }

    return json({
      cnpj: draft.cnpj,
      razao_social: draft.razao_social,
      rntrc: draft.rntrc,
      rntrc_situacao: draft.rntrc_situacao,
      endereco: draft.endereco ?? {},
      responsavel: draft.responsavel,
      cpf: draft.cpf,
      email: draft.email,
      telefone: draft.telefone,
      seguro_vigente: draft.seguro_vigente,
    });
  } catch (err) {
    console.error('[proposal-prefill] error:', err);
    return json({ error: 'Erro interno' }, 500);
  }
});
