import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const OWNER_ID = 13379041
const CNPJ_FIELD = 'dc094ce47e758abfd2732eac5bfd5f32fea3e3d6'
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
      // Usuário autenticado da equipe: envio real para admin/operator; dry_run só admin
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
      const { data: roleRows } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
      const roles = (roleRows ?? []).map((r: { role: string }) => r.role)
      if (dryRun) {
        if (!roles.includes('admin')) return json({ error: 'dry_run restrito a administradores' }, 403)
      } else if (!roles.includes('admin') && !roles.includes('operator')) {
        return json({ error: 'envio restrito à equipe' }, 403)
      }
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

    const cnpjDigits = String(contact.cnpj ?? '').replace(/\D/g, '')
    const hasCompany = cnpjDigits.length === 14 && !!String(contact.company ?? '').trim()
    const companyName = String(contact.company ?? '').trim()

    async function findOrCreateOrg(): Promise<{ id: number; created: boolean } | null> {
      if (!hasCompany) return null
      const fmt = cnpjDigits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
      for (const term of [fmt, cnpjDigits]) {
        const r = await pipedrive(`/organizations/search?term=${encodeURIComponent(term)}&fields=custom_fields&exact_match=true&limit=1`, 'GET')
        const id = r?.data?.items?.[0]?.item?.id
        if (id) return { id, created: false }
      }
      const created = await pipedrive('/organizations', 'POST', { name: companyName, owner_id: OWNER_ID, [CNPJ_FIELD]: fmt })
      const id = created?.data?.id
      if (!id) throw new Error('Pipedrive não retornou id da organização')
      try {
        await pipedrive('/notes', 'POST', { content: `CNPJ: ${cnpjDigits}`, org_id: id })
      } catch (e) { console.error('[push-lead-pipedrive] org note failed:', e) }
      return { id, created: true }
    }

    if (contact.sent_to_pipedrive_at && !dryRun) {
      if (body?.link_org === true && hasCompany) {
        const org = await findOrCreateOrg()
        const last8 = String(contact.phone_number ?? '').replace(/\D/g, '').slice(-8)
        const ps = await pipedrive(`/persons/search?term=${last8}&fields=phone&limit=1`, 'GET')
        const pid = ps?.data?.items?.[0]?.item?.id
        if (pid && org) await pipedrive(`/persons/${pid}`, 'PUT', { org_id: org.id })
        return json({ success: true, linked_org: org, person_id: pid ?? null })
      }
      return json({ success: true, skipped: true, reason: 'já enviado ao Pipedrive' })
    }

    const name = contact.name || contact.call_name || contact.phone_number
    const origin = buildOrigin(contact)

    const personPayload: Record<string, unknown> = {
      name,
      owner_id: OWNER_ID,
      phone: contact.phone_number ? [{ value: contact.phone_number, primary: true }] : undefined,
      email: contact.email ? [{ value: contact.email, primary: true }] : undefined,
    }
    const noteParts: string[] = []
    if (contact.company) noteParts.push(`Empresa: ${contact.company}`)
    if (contact.cnpj) noteParts.push(`CNPJ: ${contact.cnpj}`)

    const leadPayload: Record<string, unknown> = {
      title: `${name} — ${origin}`,
      owner_id: OWNER_ID,
    }

    if (dryRun) {
      return json({
        dry_run: true,
        contact_id: contactId,
        person: personPayload,
        lead: leadPayload,
        note: noteParts.join(' | ') || null,
        origin,
        organization: hasCompany ? { name: companyName, cnpj: cnpjDigits } : null,
      })
    }

    // 0) Organização (empresa + CNPJ) — falha não bloqueia Pessoa/Lead
    let orgId: number | null = null
    let orgError: string | null = null
    try {
      const org = await findOrCreateOrg()
      orgId = org?.id ?? null
    } catch (e) {
      orgError = e instanceof Error ? e.message : String(e)
      console.error('[push-lead-pipedrive] org failed:', orgError)
    }
    if (orgId) personPayload.org_id = orgId

    // 1) Cria a Pessoa
    const personRes = await pipedrive('/persons', 'POST', personPayload)
    const personId = personRes?.data?.id
    if (!personId) throw new Error(`Pipedrive não retornou id da pessoa: ${JSON.stringify(personRes)}`)

    // 2) Cria o Lead vinculado
    leadPayload.person_id = personId
    if (orgId) leadPayload.organization_id = orgId
    const leadRes = await pipedrive('/leads', 'POST', leadPayload)
    const leadId = leadRes?.data?.id

    // 3) Nota com CNPJ/empresa (opcional, não derruba o fluxo)
    if (noteParts.length > 0) {
      try {
        await pipedrive('/notes', 'POST', {
          content: noteParts.join(' | '),
          person_id: personId,
          lead_id: leadId,
          org_id: orgId ?? undefined,
        })
      } catch (e) {
        console.error('[push-lead-pipedrive] note failed:', e)
      }
    }

    const { error: uErr } = await supabase
      .from('contacts')
      .update({ sent_to_pipedrive_at: new Date().toISOString(), pipedrive_sync_error: orgError ? `organização: ${orgError}`.slice(0, 500) : null })
      .eq('id', contactId)
    if (uErr) console.error('[push-lead-pipedrive] update contact failed:', uErr.message)

    return json({ success: true, person_id: personId, lead_id: leadId, org_id: orgId, org_error: orgError })
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
