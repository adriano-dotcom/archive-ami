import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------------------------------------------------------------------------
// Verificação automatizada (simulação): a Iris responde de forma CONSISTENTE
// sobre a apólice do transportador SUBCONTRATADO (agregado)?
//
// Este teste NÃO cria conversas no banco. Ele envia o mesmo bloco de regras
// que já é injetado no system prompt do nina-orchestrator direto ao Lovable
// AI Gateway e valida as respostas por palavras-chave obrigatórias.
// ---------------------------------------------------------------------------

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview"; // default atual do orquestrador
const RUNS_PER_QUESTION = 2; // mede consistência

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// Bloco EXATO injetado em index.ts (~linhas 3662-3677)
const SUBCONTRATADO_BLOCK = `
⛔ REGRA INEGOCIÁVEL — APÓLICE DO TRANSPORTADOR SUBCONTRATADO (AGREGADO)
Modalidade inédita no mercado, criada para o transportador que atua como SUBCONTRATADO (agregado) e precisa apenas cumprir a exigência legal de possuir seguro de transporte para operar com o RNTRC (ANTT).

Como funciona na prática:
- Como subcontratado, o transportador NÃO precisa averbar os embarques. A averbação e a cobertura da carga são responsabilidade do CONTRATANTE PRINCIPAL (transportador contratado) da operação.
- Esta apólice serve para COMPROVAR que o transportador possui o seguro obrigatório, funcionando como DOCUMENTO DE COMPLIANCE perante a ANTT — e NÃO como seguro ativo sobre a carga.
- Sem burocracia de averbação a cada viagem: mantém a regularidade legal de forma simples e direta.

⚠️ ATENÇÃO — INFORMAÇÃO ESSENCIAL (NUNCA OMITIR):
- Como os embarques NÃO são averbados, esta apólice NÃO possui cobertura efetiva nos ramos RCTR-C, RC-DC e RC-V.
- Em caso de sinistro, NÃO haverá indenização nesta modalidade. Ela existe EXCLUSIVAMENTE para atender à obrigatoriedade legal de comprovação de seguro.
- Sempre que explicar a modalidade subcontratado, deixe esse ponto EXPLÍCITO. Nunca dê a entender que há cobertura efetiva sobre a carga.

MIGRAÇÃO PARA CONTRATADO (responsável pela carga):
- Se o transportador for atuar como CONTRATADO (assumir a carga) e precisar de cobertura REAL e EFETIVA, é OBRIGATÓRIO averbar os embarques.
- Nesse caso, oriente-o a entrar em contato com a Jacometo Corretora e solicitar a MIGRAÇÃO para o produto COM averbação — somente assim as viagens ficam efetivamente protegidas.
`;

const SYSTEM_PROMPT = `Você é a Iris, assistente da Jacometo Corretora, especialista em seguro de cargas (RCTR-C, RC-DC, RC-V) e regularização ANTT/RNTRC. Seu papel é TIRAR DÚVIDAS do transportador com respostas curtas, claras e verdadeiras. Nunca invente coberturas.
${SUBCONTRATADO_BLOCK}`;

type Check = (text: string) => boolean;

const norm = (s: string) => s.toLowerCase();
const has = (t: string, ...terms: string[]) => terms.every((x) => norm(t).includes(norm(x)));
const hasAny = (t: string, ...terms: string[]) => terms.some((x) => norm(t).includes(norm(x)));

// Sinal essencial: deixa claro que NÃO há cobertura efetiva / indenização
const noEffectiveCoverage: Check = (t) =>
  hasAny(t, "não possui cobertura", "sem cobertura", "não há cobertura", "não tem cobertura", "não haverá indeniz", "sem indeniz", "não há indeniz", "não cobre");

const compliance: Check = (t) =>
  hasAny(t, "compliance", "comprova", "obrigatoriedade legal", "exigência legal", "documento", "regulariz");

interface Question {
  id: number;
  text: string;
  requires: { label: string; check: Check }[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    text: "Como funciona essa apólice pra quem é subcontratado?",
    requires: [
      { label: "sem cobertura efetiva", check: noEffectiveCoverage },
      { label: "compliance/comprovação legal", check: compliance },
    ],
  },
  {
    id: 2,
    text: "Sou agregado de uma transportadora, essa apólice cobre a minha carga?",
    requires: [
      { label: "sem cobertura efetiva", check: noEffectiveCoverage },
    ],
  },
  {
    id: 3,
    text: "Se der um sinistro trabalhando como subcontratado, eu recebo indenização?",
    requires: [
      { label: "sem indenização", check: (t) => hasAny(t, "não haverá indeniz", "não há indeniz", "sem indeniz", "não recebe", "não terá indeniz", "não possui cobertura", "sem cobertura") },
    ],
  },
  {
    id: 4,
    text: "Preciso averbar os embarques sendo subcontratado?",
    requires: [
      { label: "subcontratado não averba", check: (t) => has(t, "não") && hasAny(t, "averb") },
      { label: "responsabilidade do contratante", check: (t) => hasAny(t, "contratante", "contratado principal", "transportador contratado", "responsabilidade") },
    ],
  },
  {
    id: 5,
    text: "Comecei a pegar carga como contratado agora, e aí, como fica meu seguro?",
    requires: [
      { label: "averbação obrigatória", check: (t) => hasAny(t, "averb") },
      { label: "migração / contato Jacometo", check: (t) => hasAny(t, "migra", "jacometo", "entre em contato", "fale com") },
    ],
  },
];

// Bloco EXATO injetado em index.ts para leads do site na PRIMEIRA mensagem
const SITE_LEAD_FIRST_RESPONSE_BLOCK = `
## 🟢 MODELO DE PRIMEIRA RESPOSTA — LEAD DO SITE (SUBCONTRATADO)
Este contato veio do SITE e é a PRIMEIRA mensagem da conversa. Nesta abertura, NÃO use a saudação genérica: responda com base no MODELO abaixo, apresentando a apólice do transportador SUBCONTRATADO (agregado).

⚠️ Como usar o modelo:
- ADAPTE a redação com suas palavras (tom curto, humano, estilo WhatsApp). Não precisa copiar literalmente.
- MANTENHA obrigatoriamente os avisos essenciais: por não ter averbação, NÃO há cobertura de RCTR-C, RC-DC e RC-V e NÃO há indenização em sinistro (produto estritamente de regularização legal).
- MANTENHA a pergunta final de direcionamento (ficar regular na ANTT × precisar de cobertura efetiva da carga).

MODELO (base para adaptar):
"""
Olá! Aqui é da *Jacometo Corretora*, especialista em seguro de transporte 🚛
Sobre a apólice que você buscou: é a nossa *solução inédita de compliance* para o transportador *subcontratado (agregado)*.
✅ Comprova que você tem o *seguro obrigatório* exigido para operar com o RNTRC (ANTT)
✅ Mantém você *regular perante a fiscalização*
⚠️ *Deixando claro:* por não ter averbação, *não há cobertura* de RCTR-C, RC-DC e RC-V e *não há indenização em sinistro*.
Pra eu te orientar: seu foco agora é *ficar regular na ANTT* ou você precisa de *cobertura efetiva da carga*?
"""`;

const SITE_LEAD_SYSTEM_PROMPT = `${SYSTEM_PROMPT}\n${SITE_LEAD_FIRST_RESPONSE_BLOCK}`;

async function ask(question: string, systemPrompt: string = SYSTEM_PROMPT): Promise<string> {
  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    }),
  });
  const data = await res.json(); // consome o corpo
  if (!res.ok) {
    throw new Error(`AI Gateway ${res.status}: ${JSON.stringify(data)}`);
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

Deno.test("Iris responde consistentemente sobre apólice do subcontratado", async () => {
  if (!LOVABLE_API_KEY) {
    console.warn("⚠️  LOVABLE_API_KEY ausente — pulando teste.");
    return;
  }

  let totalChecks = 0;
  let passedChecks = 0;
  const failures: string[] = [];

  console.log("\n===== VERIFICAÇÃO: APÓLICE DO SUBCONTRATADO =====\n");

  for (const q of QUESTIONS) {
    for (let run = 1; run <= RUNS_PER_QUESTION; run++) {
      let answer = "";
      try {
        answer = await ask(q.text);
      } catch (e) {
        failures.push(`Q${q.id} run${run}: erro na chamada — ${e instanceof Error ? e.message : e}`);
        console.log(`❌ Q${q.id} run${run}: ERRO — ${e instanceof Error ? e.message : e}`);
        continue;
      }

      const results = q.requires.map((r) => ({ label: r.label, ok: r.check(answer) }));
      const allOk = results.every((r) => r.ok);
      totalChecks += results.length;
      passedChecks += results.filter((r) => r.ok).length;

      const status = allOk ? "✅ PASS" : "❌ FAIL";
      console.log(`${status} Q${q.id} run${run}: "${q.text}"`);
      for (const r of results) {
        console.log(`      ${r.ok ? "✓" : "✗"} ${r.label}`);
      }
      if (!allOk) {
        failures.push(`Q${q.id} run${run}: faltou [${results.filter((r) => !r.ok).map((r) => r.label).join(", ")}]`);
        console.log(`      ↳ resposta: ${answer.replace(/\s+/g, " ").slice(0, 260)}...`);
      }
    }
  }

  const rate = totalChecks ? ((passedChecks / totalChecks) * 100).toFixed(1) : "0";
  console.log(`\n===== RESULTADO: ${passedChecks}/${totalChecks} checagens OK (${rate}%) =====`);
  if (failures.length) {
    console.log("\nFalhas:");
    for (const f of failures) console.log(` - ${f}`);
  }
  console.log("");

  assert(failures.length === 0, `Consistência insuficiente: ${failures.length} checagem(ns) falharam. Ver log acima.`);
});

// ---------------------------------------------------------------------------
// Verificação: abertura para LEAD DO SITE (primeira mensagem).
// A Iris deve abrir com o modelo do subcontratado, mantendo compliance ANTT,
// o aviso de sem cobertura/indenização e a pergunta final de direcionamento.
// ---------------------------------------------------------------------------
const askQuestion = (t: string) =>
  hasAny(t, "ficar regular", "regular na antt", "cobertura efetiva", "cobertura da carga", "regularizar", "?");

Deno.test("Iris abre com o modelo do subcontratado para lead do site", async () => {
  if (!LOVABLE_API_KEY) {
    console.warn("⚠️  LOVABLE_API_KEY ausente — pulando teste.");
    return;
  }

  const RUNS = 2;
  const firstMessage = "Olá! Vim pelo site e tenho dúvidas sobre os 3 seguros obrigatórios do transportador.";
  const failures: string[] = [];

  console.log("\n===== VERIFICAÇÃO: ABERTURA LEAD DO SITE (SUBCONTRATADO) =====\n");

  for (let run = 1; run <= RUNS; run++) {
    let answer = "";
    try {
      answer = await ask(firstMessage, SITE_LEAD_SYSTEM_PROMPT);
    } catch (e) {
      failures.push(`run${run}: erro na chamada — ${e instanceof Error ? e.message : e}`);
      continue;
    }

    const checks = [
      { label: "compliance/comprovação ANTT", ok: compliance(answer) },
      { label: "sem cobertura/indenização", ok: noEffectiveCoverage(answer) },
      { label: "pergunta de direcionamento final", ok: askQuestion(answer) },
    ];
    const allOk = checks.every((c) => c.ok);
    console.log(`${allOk ? "✅ PASS" : "❌ FAIL"} run${run}`);
    for (const c of checks) console.log(`      ${c.ok ? "✓" : "✗"} ${c.label}`);
    if (!allOk) {
      failures.push(`run${run}: faltou [${checks.filter((c) => !c.ok).map((c) => c.label).join(", ")}]`);
      console.log(`      ↳ resposta: ${answer.replace(/\s+/g, " ").slice(0, 260)}...`);
    }
  }

  console.log("");
  assert(failures.length === 0, `Abertura inconsistente: ${failures.length} falha(s). Ver log acima.`);
});
