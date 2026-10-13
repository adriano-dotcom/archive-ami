import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/pipedrive'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function pipedrive(path: string, method: string, body?: unknown) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY')
  const connectionKey = Deno.env.get('PIPEDRIVE_API_KEY')
  if (!lovableKey) throw new Error('LOVABLE_API_KEY is not configured')
  if (!connectionKey) throw new Error('PIPEDRIVE_API_KEY is not configured')

  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': connectionKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Pipedrive ${method} ${path} failed [${res.status}]: ${text}`)
  }
  return JSON.parse(text)
}

function buildOrigin(c: Record<string, unknown>): string {
  const parts: string[] = []
  if (c.utm_source) parts.push(String(c.utm_source))
  if (c.campaign) parts.push(String(c.campaign))
  else if (c.utm_campaign) parts.push(String(c.utm_campaign))
  if (c.meta_ad_id) parts.push(`ad:${c.meta_ad_id}`)
  if (c.lead_source) parts.push(String(c.lead_source))
  return parts.join(' · ') || 'whatsapp'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Guard: só chamada interna (service role ou x-internal-secret)
    const auth = req.headers.get('authorization') ?? ''
    const internalSecret = req.headers.get('x-internal-secret') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const cronSecret = Deno.env.get('INTERNAL_CRON_SECRET') ?? ''
    const isServiceRole = serviceRoleKey && auth === `Bearer ${serviceRoleKey}`
    const isInternal = cronSecret && internalSecret === cronSecret

    const body = await req.json().catch(() => ({}))
    const contactId = body?.contact_id
    const dryRun = body?.dry_run === true
    if (!contactId || typeof contactId !== 'string') {
      return json({ error: 'contact_id é obrigatório' }, 400)
    }

    if (!isServiceRole && !isInternal) {
      // Exceção: dry_run é liberado para admin autenticado (não envia nada ao Pipedrive)
      if (!dryRun) return json({ error: 'unauthorized' }, 401)
      const token = auth.replace(/^Bearer\s+/i, '')
      if (!token) return json({ error: 'unauthorized' }, 401)
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      )
      const { data: userData } = await authClient.auth.getUser(token)
      const userId = userData?.user?.id
      if (!userId) return json({ error: 'unauthorized' }, 401)
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const { data: roleRow } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle()
      if (!roleRow) return json({ error: 'dry_run restrito a administradores' }, 403)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: contact, error: cErr } = await supabase
      .from('contacts')
      .select('id,name,call_name,phone_number,email,cnpj,company,lead_status,lead_source,utm_source,utm_campaign,campaign,meta_ad_id,sent_to_pipedrive_at')
      .eq('id', contactId)
      .maybeSingle()

    if (cErr) throw new Error(`contacts select failed: ${cErr.message}`)
    if (!contact) return json({ error: 'contato não encontrado' }, 404)

    if (contact.sent_to_pipedrive_at && !dryRun) {
      return json({ success: true, skipped: true, reason: 'já enviado ao Pipedrive' })
    }

    const name = contact.name || contact.call_name || contact.phone_number
    const origin = buildOrigin(contact)

    const personPayload: Record<string, unknown> = {
      name,
      phone: contact.phone_number ? [{ value: contact.phone_number, primary: true }] : undefined,
      email: contact.email ? [{ value: contact.email, primary: true }] : undefined,
    }
    const noteParts: string[] = []
    if (contact.company) noteParts.push(`Empresa: ${contact.company}`)
    if (contact.cnpj) noteParts.push(`CNPJ: ${contact.cnpj}`)

    const leadPayload: Record<string, unknown> = {
      title: `${name} — ${origin}`,
    }

    if (dryRun) {
      return json({
        dry_run: true,
        contact_id: contactId,
        person: personPayload,
        lead: leadPayload,
        note: noteParts.join(' | ') || null,
        origin,
      })
    }

    // 1) Cria a Pessoa
    const personRes = await pipedrive('/persons', 'POST', personPayload)
    const personId = personRes?.data?.id
    if (!personId) throw new Error(`Pipedrive não retornou id da pessoa: ${JSON.stringify(personRes)}`)

    // 2) Cria o Lead vinculado
    leadPayload.person_id = personId
    const leadRes = await pipedrive('/leads', 'POST', leadPayload)
    const leadId = leadRes?.data?.id

    // 3) Nota com CNPJ/empresa (opcional, não derruba o fluxo)
    if (noteParts.length > 0) {
      try {
        await pipedrive('/notes', 'POST', {
          content: noteParts.join(' | '),
          person_id: personId,
          lead_id: leadId,
        })
      } catch (e) {
        console.error('[push-lead-pipedrive] note failed:', e)
      }
    }

    const { error: uErr } = await supabase
      .from('contacts')
      .update({ sent_to_pipedrive_at: new Date().toISOString(), pipedrive_sync_error: null })
      .eq('id', contactId)
    if (uErr) console.error('[push-lead-pipedrive] update contact failed:', uErr.message)

    return json({ success: true, person_id: personId, lead_id: leadId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[push-lead-pipedrive] error:', msg)
    // Registra o erro no contato sem derrubar nada
    try {
      const body = await req.clone().json().catch(() => null)
      const contactId = body?.contact_id
      if (contactId) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )
        await supabase
          .from('contacts')
          .update({ pipedrive_sync_error: msg.slice(0, 500) })
          .eq('id', contactId)
      }
    } catch { /* ignora */ }
    return json({ success: false, error: msg }, 500)
  }
})
