import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

const OWNER_ID = 13379041 // Leonardo Sanches
const PERSON_CNPJ_FIELD = 'dc094ce47e758abfd2732eac5bfd5f32fea3e3d6'
const LABEL_COMBO = 'ab7ffe00-220c-11f1-974e-192630ddf6a5'
const LABEL_HOT = '08ab1f0f-f701-4832-80af-6a29373a1c00'
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/pipedrive'
const DISQUALIFY_RE = /(desqualif|opt.?out|emprego|n[uú]mero.?errado|engano|fornecedor|seguradora|spam)/i

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------- helpers ----------
export function isValidCnpj(v: unknown): boolean {
  const d = String(v ?? '').replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let s = 0
    for (let i = 0; i < len; i++) s += Number(d[i]) * w[i]
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

/** Remove qualquer sequência com cara de CPF (11 dígitos) — nunca vai ao Pipedrive. */
export function scrubCpf(text: string): string {
  return text.replace(/(?<![\d./-])\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}(?![\d./-])/g, '[removido]')
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isRealCompanyName(name: string, contactName: string): boolean {
  const n = name.trim()
  if (n.length < 3) return false
  if (!/[a-zA-ZÀ-ú]{3,}/.test(n)) return false
  if (/^(empresa|teste|n\/?a|sem\b|nao\b|não\b|null|undefined|desconhecid|lead|cliente|transportadora$|transportes$)/i.test(n)) return false
  if (contactName && n.toLowerCase() === contactName.trim().toLowerCase() && !/(ltda|me\b|eireli|s\.?a\.?|transport|log)/i.test(n)) return false
  return true
}

function channelOf(c: Record<string, any>): string {
  const src = String(c.utm_source ?? '').toLowerCase()
  if (['facebook', 'fb', 'ig', 'instagram'].includes(src) || c.meta_ad_id || c.ctwa_clid || c.lead_source === 'meta_ctwa') return 'Meta'
  if (['google', 'gads', 'adwords'].includes(src)) return 'Google'
  if (c.seller_id) return 'Vendedor'
  return 'Direto'
}

async function pipedrive(path: string, method = 'GET', body?: unknown) {
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
  if (!res.ok) throw new Error(`Pipedrive ${method} ${path.split('?')[0]} [${res.status}]: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

function qualification(c: Record<string, any>, force: boolean): { ok: boolean; reason?: string } {
  if (c.is_blocked || c.blocked_at) return { ok: false, reason: 'contato bloqueado/opt-out' }
  if (c.lead_status === 'churned') return { ok: false, reason: 'contato desqualificado (churned)' }
  const badTag = (c.tags ?? []).find((t: string) => DISQUALIFY_RE.test(t))
  if (badTag) return { ok: false, reason: `desqualificado (tag "${badTag}")` }
  if (DISQUALIFY_RE.test(String(c.blocked_reason ?? ''))) return { ok: false, reason: 'desqualificado (motivo de bloqueio)' }
  if (c.pipedrive_lead_id) return { ok: false, reason: 'já tem lead no Pipedrive' }
  if (['sending', 'sent'].includes(c.pipedrive_sync_status ?? '')) return { ok: false, reason: `status ${c.pipedrive_sync_status}` }
  if (!force && !isValidCnpj(c.cnpj) && !['proposal', 'customer'].includes(c.lead_status ?? '')) {
    return { ok: false, reason: 'sem CNPJ válido e sem status proposta/cliente' }
  }
  return { ok: true }
}

async function findPersonByPhone(phone: string): Promise<{ id: number; name: string; email?: string } | null> {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length < 10) return null
  const ddd = d.slice(0, 2)
  const last8 = d.slice(-8)
  const r = await pipedrive(`/persons/search?fields=phone&term=${last8}&limit=20`)
  const items: any[] = r?.data?.items ?? []
  const matches: number[] = []
  for (const it of items) {
    const phones: string[] = (it.item?.phones ?? []).map((p: any) => String(typeof p === 'string' ? p : p?.value ?? ''))
    const ok = phones.some((p) => {
      let pd = p.replace(/\D/g, '')
      if (pd.startsWith('55') && pd.length >= 12) pd = pd.slice(2)
      pd = pd.replace(/^0+/, '')
      return pd.endsWith(last8) && pd.startsWith(ddd)
    })
    if (ok) matches.push(it.item.id)
  }
  if (!matches.length) return null
  let best: any = null
  for (const id of matches) {
    const p = (await pipedrive(`/persons/${id}`))?.data
    if (p && (!best || String(p.update_time) > String(best.update_time))) best = p
  }
  return best ? { id: best.id, name: best.name, email: best.email?.[0]?.value || undefined } : null
}

async function findOrg(companyName: string, cnpj: string): Promise<number | null> {
  const fmt = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  for (const [term, extra] of [[companyName, '&fields=name&exact_match=true'], [fmt, '&fields=custom_fields&exact_match=true'], [cnpj, '&fields=custom_fields&exact_match=true']]) {
    if (!term || term.length < 2) continue
    const r = await pipedrive(`/organizations/search?term=${encodeURIComponent(term)}${extra}&limit=1`)
    const id = r?.data?.items?.[0]?.item?.id
    if (id) return id
  }
  return null
}

async function summarize(supabase: SupabaseClient, contactId: string) {
  const empty = { situacao: '', necessidades: '', proximos_passos: '' }
  const { data: convs } = await supabase.from('conversations').select('id').eq('contact_id', contactId)
  const ids = (convs ?? []).map((c: any) => c.id)
  if (!ids.length) return empty
  const { data: msgs } = await supabase
    .from('messages').select('content,from_type,sent_at')
    .in('conversation_id', ids).not('content', 'is', null)
    .order('sent_at', { ascending: false }).limit(60)
  const transcript = (msgs ?? []).reverse()
    .map((m: any) => `${m.from_type === 'user' ? 'Lead' : 'Atendente'}: ${String(m.content).slice(0, 500)}`).join('\n')
  if (!transcript) return empty
  const key = Deno.env.get('LOVABLE_API_KEY')
  if (!key) return empty
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/responses', {
      method: 'POST',
      headers: { 'Lovable-API-Key': key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({
        model: 'openai/gpt-6-astra',
        stream: true,
        store: false,
        reasoning: { effort: 'low' },
        instructions: 'Você resume conversas de venda de seguro de cargas (Combo 3 seguros obrigatórios para subcontratados). Responda em json com situacao, necessidades e proximos_passos: frases curtas em português, sem inventar, sem CPF, sem emoji.',
        input: scrubCpf(transcript),
        text: { format: { type: 'json_schema', name: 'resumo', strict: true, schema: {
          type: 'object', additionalProperties: false, required: ['situacao', 'necessidades', 'proximos_passos'],
          properties: { situacao: { type: 'string' }, necessidades: { type: 'string' }, proximos_passos: { type: 'string' } },
        } } },
      }),
    })
    if (!res.ok || !res.body) { console.error('[push-lead-pipedrive] AI', res.status, await res.text()); return empty }
    let out = ''
    let buf = ''
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += value
      const lines = buf.split('\n'); buf = lines.pop() ?? ''
      for (const l of lines) {
        if (!l.startsWith('data:')) continue
        try {
          const ev = JSON.parse(l.slice(5).trim())
          if (ev.type === 'response.output_text.delta') out += ev.delta ?? ''
        } catch { /* ignora */ }
      }
    }
    const parsed = JSON.parse(out || '{}')
    return { situacao: String(parsed.situacao ?? ''), necessidades: String(parsed.necessidades ?? ''), proximos_passos: String(parsed.proximos_passos ?? '') }
  } catch (e) {
    console.error('[push-lead-pipedrive] AI failed', e)
    return empty
  }
}

function buildNote(c: Record<string, any>, s: { situacao: string; necessidades: string; proximos_passos: string }, adName: string | null, cnpjValid: boolean) {
  const cnpj = String(c.cnpj ?? '').replace(/\D/g, '')
  const dados: [string, unknown][] = [
    ['CNPJ', cnpjValid ? cnpj : null],
    ['Empresa', c.company],
    ['Cidade/UF', [c.city, c.state].filter(Boolean).join('/') || null],
    ['E-mail', c.email],
    ['Tipo de carga', c.cargo_type],
    ['Contratado/Subcontratado', c.company_type],
  ]
  const attr: [string, unknown][] = [
    ['canal', channelOf(c)],
    ['utm_source', c.utm_source], ['utm_campaign', c.utm_campaign], ['utm_content', c.utm_content],
    ['campaign', c.campaign], ['meta_ad_id', c.meta_ad_id], ['ctwa_clid', c.ctwa_clid],
    ['referral_headline', c.referral_headline], ['anúncio', adName],
    ['1º contato', c.first_contact_date ?? c.created_at], ['id do contato', c.id],
  ]
  const line = (k: string, v: unknown) => `${esc(k)}: ${esc(v)}<br>`
  const html =
    `<b>SITUAÇÃO</b><br>${esc(s.situacao || '—')}<br><br>` +
    `<b>NECESSIDADES</b><br>${esc(s.necessidades || '—')}<br><br>` +
    `<b>DADOS COLETADOS</b><br>${dados.filter(([, v]) => v).map(([k, v]) => line(k, v)).join('') || '—<br>'}<br>` +
    `<b>PRÓXIMOS PASSOS</b><br>${esc(s.proximos_passos || '—')}<br><br>` +
    `--- Atribuição ---<br>${attr.filter(([, v]) => v).map(([k, v]) => line(k, v)).join('')}`
  // CNPJ (14 dígitos) é preservado; qualquer padrão de 11 dígitos é removido
  return scrubCpf(html)
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let contactId: string | null = null
  let claimed = false
  let dryRun = false

  try {
    const auth = req.headers.get('authorization') ?? ''
    const internalSecret = req.headers.get('x-internal-secret') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const cronSecret = Deno.env.get('INTERNAL_CRON_SECRET') ?? ''
    const isInternal = (serviceRoleKey && auth === `Bearer ${serviceRoleKey}`) || (cronSecret && internalSecret === cronSecret)

    const body = await req.json().catch(() => ({}))
    contactId = typeof body?.contact_id === 'string' ? body.contact_id : null
    dryRun = body?.dry_run === true
    const manual = !isInternal
    if (!contactId || !/^[0-9a-f-]{36}$/i.test(contactId)) return json({ error: 'contact_id é obrigatório' }, 400)

    if (!isInternal) {
      const token = auth.replace(/^Bearer\s+/i, '')
      if (!token) return json({ error: 'unauthorized' }, 401)
      const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      const { data: userData } = await authClient.auth.getUser(token)
      const userId = userData?.user?.id
      if (!userId) return json({ error: 'unauthorized' }, 401)
      const { data: roleRows } = await supabase.from('user_roles').select('role').eq('user_id', userId)
      const roles = (roleRows ?? []).map((r: { role: string }) => r.role)
      if (dryRun ? !roles.includes('admin') : !roles.includes('admin') && !roles.includes('operator')) {
        return json({ error: dryRun ? 'dry_run restrito a administradores' : 'envio restrito à equipe' }, 403)
      }
    }

    const { data: contact, error: cErr } = await supabase.from('contacts').select('*').eq('id', contactId).maybeSingle()
    if (cErr) throw new Error(`contacts select failed: ${cErr.message}`)
    if (!contact) return json({ error: 'contato não encontrado' }, 404)

    // Regra de envio (envio manual pela equipe dispensa CNPJ/status, mas respeita bloqueio/duplicidade)
    const q = qualification(contact, manual && !dryRun)
    if (!q.ok) {
      if (!dryRun && !['sending', 'sent'].includes(contact.pipedrive_sync_status ?? '') && !contact.pipedrive_lead_id) {
        await supabase.from('contacts').update({ pipedrive_sync_status: 'skipped' }).eq('id', contactId)
      }
      return json({ success: true, skipped: true, reason: q.reason, dry_run: dryRun })
    }

    // Trava contra envio duplo
    if (!dryRun) {
      const { data: lock } = await supabase.from('contacts')
        .update({ pipedrive_sync_status: 'sending' })
        .eq('id', contactId)
        .or('pipedrive_sync_status.is.null,pipedrive_sync_status.not.in.(sending,sent)')
        .select('id')
      if (!lock?.length) return json({ success: true, skipped: true, reason: 'envio já em andamento ou concluído' })
      claimed = true
    }

    const plan: Record<string, unknown> = { dry_run: dryRun, contact_id: contactId }
    const cnpj = String(contact.cnpj ?? '').replace(/\D/g, '')
    const cnpjValid = isValidCnpj(cnpj)
    const name = String(contact.name || contact.call_name || contact.phone_number || 'Lead').trim()
    const companyName = String(contact.company ?? '').trim()
    const phoneDigits = String(contact.phone_number ?? '').replace(/\D/g, '')
    const phoneE164 = phoneDigits ? `+${phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits}` : null

    // 1) Pessoa
    let personId: number | null = contact.pipedrive_person_id ? Number(contact.pipedrive_person_id) : null
    if (personId) {
      const p = (await pipedrive(`/persons/${personId}`))?.data
      const patch: Record<string, unknown> = {}
      if (p && !p.name && name) patch.name = name
      if (p && !(p.email?.[0]?.value) && contact.email) patch.email = [{ value: contact.email, primary: true }]
      plan.person = { action: 'reutilizar (id salvo no contato)', id: personId, update: patch }
      if (!dryRun && Object.keys(patch).length) await pipedrive(`/persons/${personId}`, 'PUT', patch)
    } else {
      const found = phoneDigits ? await findPersonByPhone(phoneDigits) : null
      if (found) {
        personId = found.id
        plan.person = { action: 'reutilizar (achada pelo telefone)', id: found.id, name: found.name }
        if (!dryRun && !found.email && contact.email) await pipedrive(`/persons/${found.id}`, 'PUT', { email: [{ value: contact.email, primary: true }] })
      } else {
        const payload: Record<string, unknown> = { name, owner_id: OWNER_ID }
        if (phoneE164) payload.phone = [{ value: phoneE164, primary: true }]
        if (contact.email) payload.email = [{ value: contact.email, primary: true }]
        if (cnpjValid) payload[PERSON_CNPJ_FIELD] = cnpj
        plan.person = { action: 'criar', payload }
        if (!dryRun) {
          personId = (await pipedrive('/persons', 'POST', payload))?.data?.id
          if (!personId) throw new Error('Pipedrive não retornou id da pessoa')
        }
      }
    }

    // 2) Organização
    let orgId: number | null = contact.pipedrive_org_id ? Number(contact.pipedrive_org_id) : null
    if (!orgId && cnpjValid && isRealCompanyName(companyName, name)) {
      orgId = await findOrg(companyName, cnpj)
      if (orgId) plan.organization = { action: 'reutilizar', id: orgId }
      else {
        plan.organization = { action: 'criar', name: companyName }
        if (!dryRun) orgId = (await pipedrive('/organizations', 'POST', { name: companyName, owner_id: OWNER_ID }))?.data?.id ?? null
      }
      if (!dryRun && orgId && personId) await pipedrive(`/persons/${personId}`, 'PUT', { org_id: orgId })
    } else if (!orgId) {
      plan.organization = { action: 'nenhuma', reason: cnpjValid ? 'razão social ausente/genérica' : 'sem CNPJ válido' }
    }

    // 3) Lead
    const hot = ['proposal', 'customer'].includes(contact.lead_status ?? '')
    const labels = hot ? [LABEL_COMBO, LABEL_HOT] : [LABEL_COMBO]
    let leadId: string | null = null
    let reusedLead = false
    let dealId: number | null = null
    const dealLists: any[] = []
    if (personId) dealLists.push(await pipedrive(`/persons/${personId}/deals?status=open&limit=5`))
    if (orgId) dealLists.push(await pipedrive(`/organizations/${orgId}/deals?status=open&limit=5`))
    for (const r of dealLists) {
      const d = (r?.data ?? []).find((x: any) => x?.status === 'open' || !x?.status)
      if (d?.id) { dealId = d.id; break }
    }
    if (!dealId && personId) {
      const open = await pipedrive(`/leads?person_id=${personId}&archived_status=not_archived&limit=1`)
      leadId = open?.data?.[0]?.id ?? null
      reusedLead = !!leadId
    }
    const title = `${name} · ${companyName || (cnpjValid ? cnpj : 'sem empresa')} · Combo 3 seguros`
    if (dealId) {
      plan.lead = { action: `já existe negócio aberto — só adiciona nota no deal ${dealId}`, deal_id: dealId }
    } else if (reusedLead) {
      plan.lead = { action: 'já existe lead aberto — só adiciona nota', id: leadId }
    } else {
      const leadPayload: Record<string, unknown> = { title, person_id: personId ?? '(nova pessoa)', owner_id: OWNER_ID, label_ids: labels }
      if (orgId) leadPayload.organization_id = orgId
      plan.lead = { action: 'criar', payload: leadPayload }
      if (!dryRun) {
        leadId = (await pipedrive('/leads', 'POST', leadPayload))?.data?.id ?? null
        if (!leadId) throw new Error('Pipedrive não retornou id do lead')
      }
    }

    // 4) Nota
    let adName: string | null = null
    if (contact.meta_ad_id) {
      const { data: ad } = await supabase.from('meta_ads').select('nome').eq('id', contact.meta_ad_id).maybeSingle()
      adName = ad?.nome ?? null
    }
    let skipNote = false
    const noteTarget = dealId ? `deal_id=${dealId}` : `lead_id=${leadId}`
    if (dealId || (leadId && reusedLead)) {
      const notes = await pipedrive(`/notes?${noteTarget}&sort=add_time%20DESC&limit=1`)
      const last = notes?.data?.[0]?.add_time
      if (last && Date.now() - Date.parse(String(last).replace(' ', 'T') + 'Z') < 3600_000) skipNote = true
    }
    if (skipNote) {
      plan.note = { action: `pular (já há nota nesse ${dealId ? 'negócio' : 'lead'} na última 1h)` }
      if (dryRun) plan.note_preview = buildNote(contact, await summarize(supabase, contactId), adName, cnpjValid)
    } else {
      const summary = await summarize(supabase, contactId)
      const content = buildNote(contact, summary, adName, cnpjValid)
      plan.note = { action: dealId ? `criar (fixada no negócio ${dealId})` : 'criar (fixada no lead)', content }
      if (!dryRun && dealId) await pipedrive('/notes', 'POST', { content, deal_id: dealId, pinned_to_deal_flag: 1 })
      else if (!dryRun && leadId) await pipedrive('/notes', 'POST', { content, lead_id: leadId, pinned_to_lead_flag: 1 })
    }

    if (dryRun) return json(plan)

    const { error: uErr } = await supabase.from('contacts').update({
      pipedrive_person_id: personId ? String(personId) : null,
      pipedrive_org_id: orgId ? String(orgId) : null,
      pipedrive_lead_id: leadId,
      pipedrive_deal_id: dealId ? String(dealId) : null,
      sent_to_pipedrive_at: new Date().toISOString(),
      pipedrive_sync_status: 'sent',
      pipedrive_sync_error: null,
    }).eq('id', contactId)
    if (uErr) console.error('[push-lead-pipedrive] update contact failed:', uErr.message)

    return json({ success: true, person_id: personId, org_id: orgId, lead_id: leadId, deal_id: dealId, reused_lead: reusedLead })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const msg = raw.replace(/(api_token|token|key)=[^&\s"]+/gi, '$1=***').slice(0, 500)
    console.error('[push-lead-pipedrive] error:', msg)
    if (contactId && claimed && !dryRun) {
      await supabase.from('contacts')
        .update({ pipedrive_sync_status: 'failed', pipedrive_sync_error: msg, sent_to_pipedrive_at: null })
        .eq('id', contactId)
    }
    return json({ success: false, error: msg }, 500)
  }
})
