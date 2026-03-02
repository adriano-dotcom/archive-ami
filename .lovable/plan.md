

## Replicar Chamadas WhatsApp em Outra Plataforma Lovable

### Visao Geral

Este guia contem todo o codigo necessario para replicar a funcionalidade de receber chamadas WhatsApp em outro projeto Lovable. Sao 6 passos na ordem correta.

---

### Passo 1: Criar tabela `whatsapp_calls` (Migracao SQL)

Executar esta migracao no novo projeto:

```sql
CREATE TABLE public.whatsapp_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_call_id text,
  contact_id uuid,
  conversation_id uuid,
  direction text NOT NULL DEFAULT 'inbound',
  status text NOT NULL DEFAULT 'ringing',
  phone_number_id text,
  from_number text,
  to_number text,
  started_at timestamptz DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  hangup_cause text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view whatsapp_calls"
  ON public.whatsapp_calls FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage whatsapp_calls"
  ON public.whatsapp_calls FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_calls;
```

### Passo 2: Garantir tabela de settings

O novo projeto precisa ter uma tabela com colunas `whatsapp_access_token`, `whatsapp_phone_number_id` e `whatsapp_verify_token`. Se nao existir, criar ou adicionar.

### Passo 3: Adicionar ao `supabase/config.toml`

```toml
[functions.whatsapp-call-webhook]
verify_jwt = false

[functions.whatsapp-call-accept]
verify_jwt = false

[functions.whatsapp-call-reject]
verify_jwt = false

[functions.whatsapp-call-terminate]
verify_jwt = false
```

### Passo 4: Criar as 4 Edge Functions

Copiar integralmente os arquivos deste projeto. A unica mudanca necessaria e trocar `nina_settings` pelo nome da tabela de settings do novo projeto em cada funcao.

- `supabase/functions/whatsapp-call-webhook/index.ts` - Recebe eventos da Meta, cria/atualiza chamadas, resolve contatos
- `supabase/functions/whatsapp-call-accept/index.ts` - Aceita chamada enviando SDP answer para Meta
- `supabase/functions/whatsapp-call-reject/index.ts` - Rejeita chamada
- `supabase/functions/whatsapp-call-terminate/index.ts` - Encerra chamada e calcula duracao

### Passo 5: Copiar componentes frontend

**5.1 Hook** - `src/hooks/useIncomingWhatsAppCall.ts` (202 linhas)
- Escuta Realtime na tabela `whatsapp_calls`
- Ringtone via Web Audio API (frequencias 480Hz/620Hz)
- Pre-desbloqueio do AudioContext na primeira interacao do usuario
- Enriquecimento com dados do contato

**5.2 Modal** - `src/components/IncomingCallModal.tsx` (335 linhas)
- Modal fullscreen com backdrop blur
- Animacao pulsante durante ringing (framer-motion)
- WebRTC: captura microfone, cria PeerConnection, gera SDP answer
- Botoes: Atender, Rejeitar, Mudo, Desligar
- Timer de duracao

### Passo 6: Integrar no layout principal

No componente raiz (App.tsx ou equivalente):

```typescript
import { useIncomingWhatsAppCall } from '@/hooks/useIncomingWhatsAppCall';
import { IncomingCallModal } from '@/components/IncomingCallModal';

// Dentro do componente:
const { incomingCall, dismissCall, stopRingtone } = useIncomingWhatsAppCall();

// No JSX:
<IncomingCallModal
  call={incomingCall}
  onDismiss={dismissCall}
  onStopRingtone={stopRingtone}
/>
```

### Passo 7: Configurar webhook na Meta

1. No painel Meta Developer > WhatsApp > Configuration > Webhook
2. URL: `https://[PROJECT_ID].supabase.co/functions/v1/whatsapp-call-webhook`
3. Verify token: o valor configurado na tabela de settings
4. Assinar o campo **calls**

### Dependencias necessarias

- `framer-motion` (animacoes)
- `lucide-react` (icones)
- `sonner` (toasts)
- `@supabase/supabase-js` (ja vem com Lovable Cloud)

### Checklist de validacao

- [ ] Tabela criada com Realtime habilitado
- [ ] 4 edge functions deployadas com verify_jwt = false
- [ ] Settings com token, phone_number_id e verify_token preenchidos
- [ ] Webhook registrado na Meta com campo `calls` assinado
- [ ] Hook e Modal integrados no layout principal
- [ ] Testar com chamada real para o numero configurado

