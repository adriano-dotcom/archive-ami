# Configuração de voz e modelo de TTS por ambiente

Hoje já existe voz + modelo global (Configurações → APIs) e override por agente (Configurações → Agentes), mas: a lista de vozes é fixa no código e não há separação entre ambiente de teste e produção.

## O que será feito

### 1. Configuração por ambiente (Teste x Produção)

- Nova tabela de perfis de TTS com um registro por ambiente (`test` e `production`), guardando voz, modelo, stability, similarity, style, speed e speaker boost.
- Na aba APIs, o bloco ElevenLabs ganha um seletor "Ambiente: Teste | Produção". Cada aba edita o perfil daquele ambiente, com botão "Testar voz" que usa exatamente os valores do perfil aberto.
- Botão "Copiar de Teste para Produção" para promover uma configuração aprovada.
- Ordem de precedência na hora de gerar áudio: configuração do agente (se preenchida) → perfil do ambiente → valores padrão atuais (Aria / turbo v2.5).
- Conversas reais de WhatsApp usam sempre o perfil de **Produção**; testes feitos dentro do CRM usam o perfil de **Teste**.

### 2. Lista de vozes reais da conta ElevenLabs

- Nova função de servidor que busca as vozes da conta conectada (nome, gênero/idioma e amostra de áudio) e devolve para o CRM.
- Os seletores de voz (aba APIs e edição de agente) passam a carregar essa lista, com busca por nome e botão de "ouvir amostra". Se a chamada falhar, cai na lista fixa atual para não travar a tela.
- A lista de modelos também passa a vir da conta, mantendo os nomes amigáveis atuais.

## Detalhes técnicos

- Migração: tabela `public.tts_profiles` (`environment` único: `test` | `production`, `voice_id`, `model`, `stability`, `similarity_boost`, `style`, `speed`, `speaker_boost`, timestamps + trigger de `updated_at`), com GRANT para `authenticated`/`service_role`, RLS ligada, leitura para usuários autenticados e escrita apenas para admin. Seed dos dois registros com os valores atuais de `nina_settings`.
- `supabase/functions/nina-orchestrator/index.ts`: em `generateAudioElevenLabs`, ler o perfil de ambiente (default `production`) e usar como fallback intermediário entre o agente e os defaults hardcoded; nenhum comportamento de decisão de áudio muda.
- Nova função `supabase/functions/elevenlabs-voices/index.ts`: `GET /v1/voices` e `GET /v1/models` na ElevenLabs usando `ELEVENLABS_API_KEY` do conector, com guarda de autenticação (staff) e cache curto em memória.
- `supabase/functions/test-elevenlabs-tts/index.ts`: aceita `environment` e, quando não vierem parâmetros explícitos, carrega o perfil correspondente.
- Frontend: novo hook `src/hooks/useTtsProfiles.ts` (leitura/gravação dos perfis) e `src/hooks/useElevenLabsVoices.ts` (lista de vozes/modelos com fallback). `ApiSettings.tsx` ganha o seletor de ambiente e passa a gravar em `tts_profiles`; `AgentsSettings.tsx` passa a usar a lista dinâmica de vozes, mantendo "usar configuração do ambiente" como opção vazia.
- Os campos `elevenlabs_*` em `nina_settings` continuam existindo por compatibilidade e são usados como último fallback.
