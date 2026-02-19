

## Fix: Chamada continua tocando depois de atender

### Problema
Quando a chamada e atendida, o status no banco muda para `answered`, mas o hook `useIncomingWhatsAppCall` so para o toque para os status `ended`, `rejected`, `missed`, `failed`. O status `answered` nao esta na lista, entao o ringtone continua tocando e a animacao de "chamando" persiste.

### Solucao

Duas correções complementares para garantir resposta imediata:

**1. Hook `useIncomingWhatsAppCall.ts`**
- No handler de UPDATE (linha 172), adicionar `'answered'` a lista de status que param o ringtone
- Diferente dos outros status, `answered` deve parar o ringtone mas **manter o objeto da chamada** (nao retornar null), pois o modal precisa dele para mostrar a tela "Em chamada"
- Expor a funcao `stopRingtone` no retorno do hook para uso direto pelo modal

**2. Modal `IncomingCallModal.tsx`**
- Chamar `stopRingtone()` imediatamente ao aceitar a chamada (antes de esperar a resposta da edge function), para feedback instantaneo ao usuario
- Isso garante que mesmo se o Realtime demorar, o toque para na hora

### Mudancas tecnicas

**`src/hooks/useIncomingWhatsAppCall.ts`**
- No UPDATE handler, tratar `answered` separadamente: parar ringtone mas manter o call object
- Retornar `{ incomingCall, dismissCall, stopRingtone }` ao inves de apenas `{ incomingCall, dismissCall }`

```text
// Pseudo-codigo do UPDATE handler atualizado:
if (['ended', 'rejected', 'missed', 'failed'].includes(status)) {
  stopRingtone();
  return null;  // remove call
}
if (status === 'answered') {
  stopRingtone();  // para o toque
  return { ...prev, status };  // mantem o call para a UI de "em chamada"
}
```

**`src/components/IncomingCallModal.tsx`**
- Receber `onStopRingtone` como prop
- Chamar `onStopRingtone()` no inicio de `handleAccept`, antes do WebRTC

**`src/App.tsx` (ou onde o modal e renderizado)**
- Passar `stopRingtone` como prop para o `IncomingCallModal`

### Resultado esperado
- Ao clicar "Atender": ringtone para imediatamente, animacao de pulsacao some, modal muda para modo "Em chamada" com timer e botoes de mudo/desligar
