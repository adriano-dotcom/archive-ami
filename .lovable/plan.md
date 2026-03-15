

## Adicionar Meta Pixel nas Landing Pages

O Pixel ID (`1235863101537115`) é uma chave pública — pode ser armazenado diretamente no código, sem necessidade de secrets.

### Implementação

**1. `src/components/landing-pages/LandingPagePublic.tsx`**
- Adicionar `useEffect` que injeta o script do Meta Pixel no `<head>` ao montar o componente
- Dispara `fbq('track', 'PageView')` automaticamente
- Dispara `fbq('track', 'Lead')` após submissão bem-sucedida do formulário
- Remove o script ao desmontar (cleanup)

**2. Evento de conversão no submit**
- Após o formulário ser enviado com sucesso (quando `submitted = true`), chamar `fbq('track', 'Lead')` para rastrear a conversão no Meta Ads

### Código resumido

```typescript
// No useEffect de mount:
const script = document.createElement('script');
script.innerHTML = `!function(f,b,e,v,n,t,s){...}('1235863101537115');fbq('track','PageView');`;
document.head.appendChild(script);

// No handler de submit (após sucesso):
window.fbq?.('track', 'Lead');
```

### Arquivo modificado
- `src/components/landing-pages/LandingPagePublic.tsx`

Sem novas tabelas, sem secrets, sem novas dependências.

