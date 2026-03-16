

## Configurar Subdomínio `lp.orbepet.com.br` para Landing Pages

Como o domínio principal `orbepet.com.br` já é usado no site, vamos configurar um subdomínio fixo `lp.orbepet.com.br` para todas as landing pages.

### O que você precisa fazer (DNS)

No seu registrador de domínio, adicionar:
- **Registro A**: Nome: `lp` → Valor: `185.158.133.1`

Depois, nas configurações do projeto Lovable → **Domains** → conectar `lp.orbepet.com.br`.

### O que vamos implementar no código

**1. Rota alternativa no `App.tsx`**
- Adicionar rota `/:slug` que renderiza `LandingPagePublic` **apenas** quando o hostname é `lp.orbepet.com.br`
- Criar um componente wrapper `SubdomainLandingPage` que verifica o hostname antes de renderizar

**2. Atualizar URL no admin (`LandingPagesAdmin.tsx`)**
- Alterar `copyLink()` para gerar `https://lp.orbepet.com.br/nome-da-pagina`
- Atualizar o link de visualização externa para usar o mesmo domínio

**3. Manter rota `/lp/:slug` como fallback**
- A rota existente continua funcionando para desenvolvimento e preview

Nenhuma mudança de banco de dados necessária.

