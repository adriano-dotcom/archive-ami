

## Diagnóstico: Redirecionamento do Subdomínio

### Problema Identificado

O Lovable redireciona todos os domínios secundários para o **domínio primário** do projeto. Como `cobranca.jacometo.com.br` é o domínio primário, quando alguém acessa `lp.orbepet.com.br/vacinas-...`:

1. A infraestrutura do Lovable redireciona para `cobranca.jacometo.com.br/vacinas-...`
2. O `SubdomainLandingPage` verifica o hostname — como não é `lp.orbepet.com.br`, faz `Navigate to="/"`
3. O app redireciona para `/chat`

**Não é possível ter dois domínios ativos simultaneamente no Lovable** — o secundário sempre redireciona para o primário.

### Solução Prática

Como `orbepet.com.br` já é usado pelo site principal e `cobranca.jacometo.com.br` é o domínio primário deste projeto, a melhor abordagem é usar o **path `/lp/:slug`** que já funciona:

```
https://cobranca.jacometo.com.br/lp/vacinas-informa--es-importantes
```

**Mudanças no código:**

1. **`LandingPagesAdmin.tsx`**: Atualizar `copyLink()` para gerar a URL correta com o domínio primário + path `/lp/slug`
2. **`App.tsx`**: Remover a rota `/:slug` do `SubdomainLandingPage` para evitar conflitos de roteamento
3. **Remover `SubdomainLandingPage.tsx`** já que não será mais necessário

### Arquivos Modificados
- `src/App.tsx` — remover rota `/:slug`
- `src/components/landing-pages/LandingPagesAdmin.tsx` — ajustar URL de cópia
- Deletar `src/components/landing-pages/SubdomainLandingPage.tsx`

