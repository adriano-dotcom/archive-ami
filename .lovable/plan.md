

## Atualizar Favicon com Logo OrbePet

A logo `orbepet-logo.png` já existe em `src/assets/`. O favicon atual é um `.ico` genérico.

### Implementação

1. **Copiar** `src/assets/orbepet-logo.png` para `public/favicon.png` (substituindo o existente)
2. **Atualizar `index.html`**: trocar a referência do favicon de `.ico` para `.png` apontando para a logo OrbePet
3. **Landing pages (`LandingPagePublic.tsx`)**: adicionar `useEffect` para setar o favicon dinamicamente com a logo OrbePet, garantindo que mesmo acessando só a landing page o favicon apareça correto

Resultado: todas as páginas (app + landing pages) exibirão a logo OrbePet como favicon.

