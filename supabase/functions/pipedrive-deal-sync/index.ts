// Leitura de negócios no Pipedrive -> eventos de funil (deal_open / deal_won / deal_lost).
// Só GET no Pipedrive. Escreve apenas no nosso banco.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/pipedrive'
const DAY = 86_400_000
// Funis considerados: 22 = Site Seguro obrigatório / Combo, 15 = seguro de carga normal
const ALLOWED_PIPELINES = [22, 15]

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function isValidCnpj(v: unknown): boolean {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let calls = 0

async function pdGet(path: string): Promise<any> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY')
  const connectionKey = Deno.env.get('PIPEDRIVE_API_KEY')
  if (!lovableKey || !connectionKey) throw new Error('Pipedrive connection not configured')
  for (let attempt = 0; attempt < 5; attempt++) {
    calls++
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': connectionKey },
    })
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1000 * 2 ** attempt
      console.warn(`[deal-sync] 429, aguardando ${wait}ms`)
      await sleep(wait)
      continue
    }
    const text = await res.text()
    if (!res.ok) throw new Error(`Pipedrive GET ${path.split('?')[0]} [${res.status}]: ${text.slice(0, 200)}`)
    return JSON.parse(text)
  }
  throw new Error(`Pipedrive GET ${path.split('?')[0]}: limite de tentativas (429)`)
}

async function findPersonsByPhone(phone: string): Promise<number[]> {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length < 10) return []
  const ddd = d.slice(0, 2)
  const last8 = d.slice(-8)
  const r = await pdGet(`/persons/search?fields=phone&term=${last8}&limit=20`)
  const found: { id: number; t: string }[] = []
  for (const it of r?.data?.items ?? []) {
    const phones: string[] = (it.item?.phones ?? []).map((p: any) => String(typeof p === 'string' ? p : p?.value ?? ''))
    const ok = phones.some((p) => {
      let pd = p.replace(/\D/g, '')
      if (pd.startsWith('55') && pd.length >= 12) pd = pd.slice(2)
      pd = pd.replace(/^0+/, '')
      return pd.endsWith(last8) && pd.startsWith(ddd)
    })
    if (ok) {
      found.push({ id: it.item.id, t: String(it.item?.update_time ?? '') })
    }
  }
  return found.sort((a, b) => (a.t < b.t ? 1 : -1)).map((f) => f.id)
}

async function findOrgsByCnpj(cnpj: string): Promise<number[]> {
  const fmt = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  const ids = new Set<number>()
  for (const term of [fmt, cnpj]) {
    const r = await pdGet(`/organizations/search?term=${encodeURIComponent(term)}&fields=custom_fields&exact_match=true&limit=5`)
    for (const it of r?.data?.items ?? []) if (it.item?.id) ids.add(it.item.id)
  }
  return [...ids]
}

const pdTime = (s: unknown) => (s ? Date.parse(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')) : NaN)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Auth: chamada interna (cron com segredo do Vault) ou admin logado
  const auth = req.headers.get('authorization') ?? ''
  const internal = req.headers.get('x-internal-secret') ?? ''
  const cronSecret = Deno.env.get('INTERNAL_CRON_SECRET') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  let ok = (cronSecret && internal === cronSecret) || (serviceKey && auth === `Bearer ${serviceKey}`)
  if (!ok && internal) {
    const { data: vaultSecret } = await supabase.rpc('get_vault_secret', { secret_name: 'internal_cron_secret' })
    ok = !!vaultSecret && internal === vaultSecret
  }
  if (!ok) {
    const token = auth.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'unauthorized' }, 401)
    const { data: u } = await createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(token)
    if (!u?.user) return json({ error: 'unauthorized' }, 401)
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: u.user.id, _role: 'admin' })
    if (!isAdmin) return json({ error: 'somente administradores' }, 403)
  }

  const started = Date.now()
  const stats = { contatos_varridos: 0, pessoas_achadas_por_telefone: 0, negocios_vistos: 0, eventos_deal_open: 0, eventos_deal_won: 0, eventos_deal_lost: 0, valor_ganho_novo: 0, erros: 0, chamadas_pipedrive: 0 }
  const errors: string[] = []

  try {
    const since = new Date(Date.now() - 180 * DAY).toISOString()
    const { data: rows, error } = await supabase.from('contacts')
      .select('id,name,phone_number,cnpj,lead_status,created_at,first_contact_date,pipedrive_person_id,pipedrive_deal_id')
      .or(`first_contact_date.gte.${since},and(first_contact_date.is.null,created_at.gte.${since})`)
    if (error) throw new Error(error.message)
    const contacts = (rows ?? []).filter((c: any) => c.pipedrive_person_id || isValidCnpj(c.cnpj) || ['proposal', 'customer'].includes(c.lead_status))

    const personCache = new Map<number, any>() // person -> details
    const dealsCache = new Map<string, any[]>() // 'p:id' | 'o:id' -> deals

    const dealsOf = async (key: string, path: string) => {
      if (!dealsCache.has(key)) {
        const all: any[] = []
        let start = 0
        while (true) {
          const r = await pdGet(`${path}${path.includes('?') ? '&' : '?'}status=all_not_deleted&limit=100&start=${start}`)
          all.push(...(r?.data ?? []))
          const pg = r?.additional_data?.pagination
          if (!pg?.more_items_in_collection) break
          start = pg.next_start
        }
        dealsCache.set(key, all)
      }
      return dealsCache.get(key)!
    }

    for (const c of contacts) {
      stats.contatos_varridos++
      try {
        const personIds = new Set<number>()
        if (c.pipedrive_person_id) personIds.add(Number(c.pipedrive_person_id))
        const byPhone = c.phone_number ? await findPersonsByPhone(c.phone_number) : []
        byPhone.forEach((id) => personIds.add(id))
        if (!c.pipedrive_person_id && byPhone.length) {
          stats.pessoas_achadas_por_telefone++
          await supabase.from('contacts').update({ pipedrive_person_id: String(byPhone[0]) }).eq('id', c.id)
        }
        const orgIds = new Set<number>()
        const cnpjDigits = String(c.cnpj ?? '').replace(/\D/g, '')
        if (isValidCnpj(cnpjDigits)) (await findOrgsByCnpj(cnpjDigits)).forEach((id) => orgIds.add(id))
        if (!personIds.size && !orgIds.size) continue
        const personId = c.pipedrive_person_id ? Number(c.pipedrive_person_id) : byPhone[0] ?? null

        const deals = new Map<number, any>()
        for (const pid of personIds) {
          if (!personCache.has(pid)) personCache.set(pid, (await pdGet(`/persons/${pid}`))?.data ?? {})
          const person = personCache.get(pid)
          const o = person?.org_id?.value ?? person?.org_id ?? null
          if (typeof o === 'number') orgIds.add(o)
          for (const d of await dealsOf(`p:${pid}`, `/persons/${pid}/deals`)) deals.set(d.id, d)
        }
        for (const oid of orgIds) for (const d of await dealsOf(`o:${oid}`, `/organizations/${oid}/deals`)) deals.set(d.id, d)

        const firstAt = Date.parse(c.first_contact_date ?? c.created_at)
        const windowStart = firstAt - DAY // tolerância de 1 dia
        const windowEnd = firstAt + 180 * DAY
        let latest: any = null

        for (const d of deals.values()) {
          if (!ALLOWED_PIPELINES.includes(Number(d.pipeline_id))) continue
          const added = pdTime(d.add_time)
          if (!(added >= windowStart && added <= windowEnd)) continue
          stats.negocios_vistos++
          if (!latest || added > pdTime(latest.add_time)) latest = d
          const base = {
            pipedrive_person_id: String(d.person_id?.value ?? d.person_id ?? personId ?? ''),
            pipedrive_deal_id: String(d.id),
            deal_pipeline_id: d.pipeline_id ?? null,
          }
          const r1 = await supabase.rpc('record_funnel_event', {
            p_contact_id: c.id, p_event_type: 'deal_open', p_occurred_at: new Date(added).toISOString(),
            p_extra: { ...base, key: String(d.id), deal_value: d.value ?? null, metadata: { title: d.title, stage_id: d.stage_id } },
          })
          if (r1.data === true) stats.eventos_deal_open++
          if (d.status === 'won') {
            const r2 = await supabase.rpc('record_funnel_event', {
              p_contact_id: c.id, p_event_type: 'deal_won', p_occurred_at: new Date(pdTime(d.won_time) || Date.now()).toISOString(),
              p_extra: { ...base, key: String(d.id), deal_value: d.value ?? 0, metadata: { title: d.title, won_time: d.won_time, currency: d.currency } },
            })
            if (r2.data === true) { stats.eventos_deal_won++; stats.valor_ganho_novo += Number(d.value ?? 0) }
          } else if (d.status === 'lost') {
            const r3 = await supabase.rpc('record_funnel_event', {
              p_contact_id: c.id, p_event_type: 'deal_lost', p_occurred_at: new Date(pdTime(d.lost_time) || Date.now()).toISOString(),
              p_extra: { ...base, key: String(d.id), deal_value: d.value ?? null, metadata: { title: d.title, lost_reason: d.lost_reason ?? null } },
            })
            if (r3.data === true) stats.eventos_deal_lost++
          }
        }
        if (latest && String(latest.id) !== c.pipedrive_deal_id) {
          await supabase.from('contacts').update({ pipedrive_deal_id: String(latest.id) }).eq('id', c.id)
        }
      } catch (e) {
        stats.erros++
        errors.push(`${c.id}: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`)
      }
    }

    // Total ganho registrado (todos os tempos, deals distintos)
    const { data: wonRows } = await supabase.from('lead_funnel_events').select('pipedrive_deal_id,deal_value,deal_pipeline_id').eq('event_type', 'deal_won').eq('excluded', false)
    const seen = new Set<string>()
    let totalWon = 0
    for (const w of wonRows ?? []) { if (!seen.has(w.pipedrive_deal_id)) { seen.add(w.pipedrive_deal_id); totalWon += Number(w.deal_value ?? 0) } }

    const porFunil: Record<string, { ganhos: number; valor: number }> = {}
    const seen2 = new Set<string>()
    for (const w of wonRows ?? []) { if (seen2.has(w.pipedrive_deal_id)) continue; seen2.add(w.pipedrive_deal_id); const k = String(w.deal_pipeline_id); porFunil[k] ??= { ganhos: 0, valor: 0 }; porFunil[k].ganhos++; porFunil[k].valor = Math.round((porFunil[k].valor + Number(w.deal_value ?? 0)) * 100) / 100 }
    stats.chamadas_pipedrive = calls
    const result = { success: true, ...stats, ganhos_registrados_total: seen.size, valor_ganho_total: Math.round(totalWon * 100) / 100, ganhos_por_funil: porFunil, duracao_ms: Date.now() - started, erros_detalhe: errors.slice(0, 10) }
    console.log('[deal-sync]', JSON.stringify(result))
    return json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[deal-sync] fatal:', msg)
    return json({ success: false, error: msg, ...stats }, 500)
  }
})
