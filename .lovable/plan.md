

## Atualizar links no Admin para usar `lp.orbepet.com.br`

O subdomínio está funcionando. Agora preciso atualizar o painel admin para gerar os links corretos.

### Mudanças em `src/components/landing-pages/LandingPagesAdmin.tsx`

1. **`copyLink()`**: Trocar `window.location.origin` por `https://lp.orbepet.com.br`
2. **Link de preview externo**: Atualizar `href` para `https://lp.orbepet.com.br/lp/${slug}`
3. **Texto do slug exibido**: Mostrar `lp.orbepet.com.br/lp/{slug}` em vez de `/lp/{slug}`

Um arquivo, 3 linhas alteradas.

