import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHash } from 'node:crypto'

/**
 * Consulta pública do RNTRC na ANTT a partir do CNPJ.
 *
 * Faz o "scraping" do portal oficial
 * https://consultapublica.antt.gov.br/Site/ConsultaRNTRC.aspx
 * (ASP.NET WebForms com VIEWSTATE + Altcha PoW). Não há API pública oficial da
 * ANTT; essa é a única forma gratuita de obter o RNTRC a partir do CNPJ.
 *
 * Endpoint: POST /functions/v1/consulta-antt  body: { cnpj: string }
 * Uso interno (chamado pelo nina-orchestrator com service key).
 */

const URL_FORM = 'https://consultapublica.antt.gov.br/Site/ConsultaRNTRC.aspx'
const URL_ALTCHA = 'https://captcha.srvs.antt.gov.br/altcha'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const TTL_HIT_MS = 24 * 60 * 60 * 1000 // 24h para resultados positivos
const TTL_MISS_MS = 60 * 60 * 1000 // 1h para negativos/erros

interface AnttResult {
  found: boolean
  rntrc?: string
  situacao?: string
  transportador?: string
  cpfCnpj?: string
  cadastradoDesde?: string
  municipioUf?: string
  error?: string
}

interface AltchaChallenge {
  algorithm: string
  challenge: string
  salt: string
  signature: string
  maxnumber: number
}

function isValidCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false
  const calc = (len: number): number => {
    const weights =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i]
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13])
}

function pickHidden(html: string, name: string): string {
  const re = new RegExp(
    `name="${name.replace(/\$/g, '\\$')}"[^>]*value="([^"]*)"`,
    's',
  )
  return html.match(re)?.[1] ?? ''
}

function getCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] }
  const arr = headers.getSetCookie ? headers.getSetCookie() : []
  if (arr.length > 0) {
    return arr.map((c) => c.split(';')[0]).join('; ')
  }
  const raw = res.headers.get('set-cookie') ?? ''
  return raw
    .split(/,(?=[^ ]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
}

function solveAltcha(c: AltchaChallenge): number {
  // PoW: encontrar n tal que sha256(salt + n) === challenge
  for (let n = 0; n <= c.maxnumber; n++) {
    const h = createHash('sha256').update(`${c.salt}${n}`).digest('hex')
    if (h === c.challenge) return n
  }
  throw new Error('Altcha challenge não resolvido')
}

// Base64 iterativo byte-a-byte (evita limitações de spread em arrays grandes)
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function strip(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

async function readCache(
  supabase: ReturnType<typeof createClient>,
  cnpj: string,
): Promise<AnttResult | null> {
  try {
    const { data } = await supabase
      .from('antt_cache')
      .select('payload, fetched_at')
      .eq('cnpj', cnpj)
      .maybeSingle()
    if (!data) return null
    const age = Date.now() - new Date(data.fetched_at as string).getTime()
    const payload = data.payload as unknown as AnttResult
    const ttl = payload.found ? TTL_HIT_MS : TTL_MISS_MS
    if (age > ttl) return null
    return payload
  } catch (err) {
    console.warn('[antt-cache] read failed:', (err as Error).message)
    return null
  }
}

async function writeCache(
  supabase: ReturnType<typeof createClient>,
  cnpj: string,
  payload: AnttResult,
): Promise<void> {
  try {
    await supabase
      .from('antt_cache')
      .upsert({ cnpj, payload, fetched_at: new Date().toISOString() })
  } catch (err) {
    console.warn('[antt-cache] write failed:', (err as Error).message)
  }
}

async function consultarAntt(cnpj: string): Promise<AnttResult> {
  // 1) GET formulário inicial → VIEWSTATE + cookies de sessão
  const r1 = await fetch(URL_FORM, { headers: { 'User-Agent': UA } })
  if (!r1.ok) throw new Error(`ANTT GET ${r1.status}`)
  const html = await r1.text()
  const cookie = getCookies(r1)
  const vs = pickHidden(html, '__VIEWSTATE')
  const vsg = pickHidden(html, '__VIEWSTATEGENERATOR')
  const ev = pickHidden(html, '__EVENTVALIDATION')
  if (!vs || !ev) throw new Error('Formulário ANTT mudou de layout')

  // 2) Pega challenge Altcha e resolve PoW
  const chRes = await fetch(URL_ALTCHA, {
    headers: { 'User-Agent': UA, Cookie: cookie },
  })
  if (!chRes.ok) throw new Error(`Altcha ${chRes.status}`)
  const ch = (await chRes.json()) as AltchaChallenge
  const number = solveAltcha(ch)
  const altchaB64 = toBase64(
    JSON.stringify({
      algorithm: ch.algorithm,
      challenge: ch.challenge,
      number,
      salt: ch.salt,
      signature: ch.signature,
    }),
  )

  // 3) POST com o CNPJ
  const form = new URLSearchParams({
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __VIEWSTATE: vs,
    __VIEWSTATEGENERATOR: vsg,
    __EVENTVALIDATION: ev,
    'ctl00$Corpo$rbTipoConsulta': '1',
    'ctl00$Corpo$txtRNTRC': '',
    'ctl00$Corpo$txtCpfCnpj': cnpj,
    'ctl00$Corpo$hfPnlConsulta': '',
    'ctl00$Corpo$hfAltchaUrl': URL_ALTCHA,
    altcha: altchaB64,
    'ctl00$Corpo$btnConsulta': 'Consultar',
  })
  const r2 = await fetch(URL_FORM, {
    method: 'POST',
    body: form,
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie,
      Referer: URL_FORM,
    },
  })
  if (!r2.ok) throw new Error(`ANTT POST ${r2.status}`)
  const out = await r2.text()

  // 4) Localiza a tabela de resultado (cabeçalho contém "Situação RNTRC")
  const tables = out.match(/<table[^>]*>[\s\S]*?<\/table>/gi) ?? []
  const table = tables.find((t) => /Situa(ç|c)(ã|a)o RNTRC/i.test(t))
  if (!table) {
    const notFound =
      /N(ã|a)o (foi )?encontrad/i.test(out) ||
      /nenhum (registro|resultado)/i.test(out)
    return {
      found: false,
      error: notFound
        ? 'CNPJ não localizado no RNTRC da ANTT.'
        : 'Sem resultados para este CNPJ.',
    }
  }

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1])
  if (rows.length < 2) {
    return { found: false, error: 'Resposta inesperada da ANTT.' }
  }
  const headerCells = [
    ...rows[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi),
  ].map((m) => strip(m[1]))
  const dataCells = [
    ...rows[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi),
  ].map((m) => strip(m[1]))
  const cell = (label: string): string => {
    const i = headerCells.findIndex((h) =>
      h.toLowerCase().startsWith(label.toLowerCase()),
    )
    return i >= 0 ? dataCells[i] ?? '' : ''
  }

  return {
    found: true,
    transportador: cell('Transportador'),
    cpfCnpj: cell('CPF/CNPJ'),
    rntrc: cell('RNTRC').replace(/^0+/, '') || cell('RNTRC'),
    situacao: cell('Situação RNTRC') || cell('Situacao RNTRC'),
    cadastradoDesde: cell('Cadastrado'),
    municipioUf: cell('Município') || cell('Municipio'),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { cnpj?: string }
    const cnpj = (body.cnpj ?? '').replace(/\D/g, '')
    if (!isValidCnpj(cnpj)) {
      return new Response(
        JSON.stringify({ found: false, error: 'CNPJ inválido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const cached = await readCache(supabase, cnpj)
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-cache': 'HIT' },
      })
    }

    let result: AnttResult
    try {
      result = await consultarAntt(cnpj)
    } catch (err) {
      console.error('[consulta-antt] scraping erro:', (err as Error).message)
      // Erros transitórios NÃO são cacheados
      return new Response(
        JSON.stringify({
          found: false,
          error: 'Não foi possível consultar a ANTT agora. Tente novamente.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-cache': 'MISS' } },
      )
    }

    await writeCache(supabase, cnpj, result)
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-cache': 'MISS' },
    })
  } catch (err) {
    console.error('[consulta-antt] erro:', err)
    return new Response(
      JSON.stringify({ found: false, error: 'Erro interno na consulta ANTT.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
