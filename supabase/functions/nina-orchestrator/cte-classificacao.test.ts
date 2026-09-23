import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractQualificationFromMessages,
  mergeQualificationAnswers,
} from "./index.ts";

// ---------------------------------------------------------------------------
// Verificação com CONVERSAS REAIS: lead que emite o próprio CT-e precisa ser
// classificado como CONTRATADO, e o rótulo "subcontratado" gravado antes não
// pode prender o lead para sempre.
//
// Não escreve no banco, não chama IA, não envia mensagem.
// ---------------------------------------------------------------------------

type Turn = { msg: string; espera: string | null };

function percorrer(nome: string, qaInicial: Record<string, any>, turnos: Turn[]) {
  const historico: string[] = [];
  let qa: Record<string, any> = { ...qaInicial };
  console.log(`\n=== ${nome} ===`);
  console.log(`perfil inicial: ${qa.tipo_transportador ?? "(nenhum)"}`);
  for (const t of turnos) {
    historico.push(t.msg);
    const antes = qa.tipo_transportador ?? "(nenhum)";
    const { mergedQA } = mergeQualificationAnswers(qa, extractQualificationFromMessages(historico));
    qa = mergedQA;
    const depois = qa.tipo_transportador ?? "(nenhum)";
    const ok = t.espera === null ? true : depois === t.espera;
    console.log(`${ok ? "PASS" : "FALHA"} | "${t.msg.replace(/\s+/g, " ").slice(0, 70)}" | ${antes} -> ${depois}`);
    if (t.espera !== null) assertEquals(depois, t.espera, `turno: ${t.msg}`);
  }
  return qa;
}

// Conversa real — Cléo (5521...), veio do site. Estava gravada no sistema como
// "subcontratado" mesmo dizendo que emite CT-e e carrega direto do embarcador.
Deno.test("conversa real (Cléo): lead que emite CT-e é classificado como contratado", () => {
  percorrer("Cléo — emite CT-e, carrega direto do embarcador", {}, [
    { msg: "Olá! Vim pelo site e tenho dúvidas sobre os 3 seguros obrigatórios do transportador.", espera: null },
    { msg: "Bom dia", espera: null },
    { msg: "Gostaria de mais informações", espera: null },
    { msg: "Oi não sou agregado a transportadora emito CTE e carrego direto embargador", espera: "contratado" },
    { msg: "Não sou agregado sou tac equiparada carrego direto embargador", espera: "contratado" },
    { msg: "CNPJ 28163367/000145", espera: "contratado" },
    { msg: "Aguardo os valores dos 3 seguros. Obrigada", espera: "contratado" },
  ]);
});

// Conversa real — Lucielio Almeida: responde "Não, sou contratado. Eu mesmo
// emito o próprio CT" — o "Não" é resposta à pergunta, não negativa de emissão.
Deno.test("conversa real (Lucielio): 'Não, sou contratado. Eu mesmo emito o próprio CT'", () => {
  percorrer("Lucielio — 'Não, ... emito o próprio CT'", {}, [
    { msg: "Olá! Vim pelo site e tenho dúvidas sobre os 3 seguros obrigatórios do transportador.", espera: null },
    { msg: "Boa tarde. Não, sou contratado. Eu mesmo emito o próprio CT", espera: "contratado" },
    { msg: "15084873000105", espera: "contratado" },
    { msg: "emiti cte como contratato", espera: "contratado" },
  ]);
});

// Destravamento: conversa já gravada como subcontratado e o lead corrige.
Deno.test("lock não é permanente: correção explícita volta o perfil para contratado", () => {
  percorrer("Lead travado como subcontratado que passa a emitir CT-e", { tipo_transportador: "subcontratado" }, [
    { msg: "Sub contratado, trabalho como terceiro pra outras empresas", espera: "subcontratado" },
    { msg: "Agora eu emito o meu CT-e, passei a pegar carga direto", espera: "contratado" },
  ]);
});

// A blindagem continua valendo: menção solta não troca o perfil.
Deno.test("blindagem mantida: menções soltas não revertem subcontratado", () => {
  percorrer("Subcontratado falando de seguro do caminhão e mandando foto", { tipo_transportador: "subcontratado" }, [
    { msg: "Sou subcontratado, agregado de uma transportadora", espera: "subcontratado" },
    { msg: "Eu tenho seguro na Porto Seguro, é do caminhão", espera: "subcontratado" },
    { msg: "[Texto extraído da imagem: CT-E N°. 000.000.016 CONHECIMENTO DE TRANSPORTE]", espera: "subcontratado" },
    { msg: "Quem contrata é que emite o CT-e, eu não emito CT-e nem manifesto", espera: "subcontratado" },
  ]);
});

// Conversa real — g magela327: negativa real de emissão permanece subcontratado.
Deno.test("conversa real (g magela327): quem não emite CT-e continua subcontratado", () => {
  percorrer("g magela327 — não emite CT-e/manifesto", {}, [
    { msg: "Olá! Vim pelo site e tenho dúvidas sobre os 3 seguros obrigatórios do transportador.", espera: null },
    { msg: "Sub contratado\nComo terceiro p outras empresas\nNão emito ciot CTE manifesto\nNem pretendo", espera: "subcontratado" },
    { msg: "08284953000130", espera: "subcontratado" },
    { msg: "Agora cê tá confundindo aí. Eu não tenho-- eu, eu não emito CT-e, eu não emito manifesto. Pelo contrário, meu seguro com a Porto é de veículo, tá?", espera: "subcontratado" },
  ]);
});
