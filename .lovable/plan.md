## Objetivo

Trazer para este projeto (Iris / WhatsApp) a consulta combinada de **CNPJ (Receita)** + **RNTRC (ANTT)** do transportador que existe no projeto **[Mitsui Projeto](/projects/3d1c0091-2181-4f95-bad0-814558013036)**, e devolver o resultado ao contato para conferência.

Hoje este projeto já detecta o CNPJ na mensagem e consulta a BrasilAPI para pegar a razão social, respondendo "Encontrei: EMPRESA. Está correto?". **Falta a parte da ANTT/RNTRC.** No Mitsui, a ANTT é obtida via scraping do portal oficial (ASP.NET WebForms + desafio Altcha PoW), pois não existe API pública. Vamos portar essa lógica.

## O que será feito

### 1. Nova Edge Function `consulta-antt`
Porta em Deno do scraper da ANTT do Mitsui (`antt.consulta.ts`):
- Recebe `POST { cnpj }` e retorna `{ found, rntrc, situacao, transportador, cpfCnpj, cadastradoDesde, municipioUf }`.
- Fluxo: GET no formulário da ANTT (captura `__VIEWSTATE`/`__EVENTVALIDATION` + cookies) → busca o desafio Altcha → resolve o Proof-of-Work (sha256 do `salt+n`) usando `node:crypto` → POST com o CNPJ → parseia a tabela de resultado.
- Cache em nova tabela `antt_cache` (24h para positivos, 1h para negativos) para não reconsultar o portal lento a cada mensagem.
- `verify_jwt = false` (chamada interna com service key).

### 2. Enriquecer a detecção de CNPJ no `nina-orchestrator`
No bloco existente "IMMEDIATE CNPJ DETECTION WITH CONFIRMATION" (~linha 3296):
- Após a consulta BrasilAPI, chamar também a `consulta-antt`.
- Salvar no contato: `cnpj`, `company` (já existe) e agora `rntrc` (a coluna já existe na tabela `contacts`).
- Montar a mensagem de conferência combinando os dois resultados. Exemplos:
  - Com RNTRC: `Encontrei: RAZÃO SOCIAL. RNTRC nº 1234567 — situação: Ativo na ANTT. Está correto?`
  - Sem RNTRC: `Encontrei: RAZÃO SOCIAL. Não localizei RNTRC ativo na ANTT para este CNPJ — você já tem registro de ETC na ANTT? Está correto?`
- Manter o comportamento atual como fallback quando a BrasilAPI ou a ANTT falharem (salva o que conseguir e segue).

### 3. Migração de banco
Criar tabela `antt_cache` (`cnpj text pk`, `payload jsonb`, `fetched_at timestamptz`) com RLS habilitado e GRANT apenas para `service_role` (uso exclusivo das edge functions).

## Detalhes técnicos

- O Mitsui é TanStack Start (server routes); este projeto é React+Vite com Supabase Edge Functions, então o código é reescrito como função Deno em vez de reaproveitado diretamente.
- O Altcha PoW é síncrono e leve (loop de sha256 até `maxnumber`); roda bem em Deno via `node:crypto`.
- A conversão base64 do payload Altcha seguirá o padrão iterativo byte-a-byte já adotado no projeto (memória do projeto sobre limitação de spread em arrays grandes) — aqui o payload é pequeno, mas manteremos consistência.
- A consulta ANTT depende do layout do portal oficial; se ele mudar, a função retorna `found:false` com erro amigável sem quebrar o fluxo do chat.
- Sem novos segredos: BrasilAPI e ANTT são públicas; a `consulta-antt` usa `SUPABASE_SERVICE_ROLE_KEY` já disponível.

## Validação
- Deploy da `consulta-antt` e teste via curl com um CNPJ de transportadora conhecido (RNTRC ativo) e um sem RNTRC.
- Deploy do `nina-orchestrator` e verificação nos logs de que a mensagem de conferência inclui razão social + RNTRC.
