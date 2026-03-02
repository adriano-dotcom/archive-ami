

## Analise: Fundo Branco

O problema e que o app esta rodando em **modo claro** (light mode). A variavel CSS `--background` no `:root` e `0 0% 98%` (quase branco). A classe `dark` nunca e aplicada no `<html>`.

O componente Settings usa classes dark hardcoded (`bg-slate-950`, `bg-slate-900/50`), entao o conteudo interno fica escuro, mas o **layout principal** (`AppLayout`) usa `bg-background` que resolve para branco.

### Opcoes

1. **Forcar dark mode globalmente** — adicionar `class="dark"` no `<html>` em `index.html`, garantindo que `bg-background` resolva para o valor escuro (`273 20% 8%`). Isso e o mais simples e alinha tudo ao tema escuro que ja e usado em todos os componentes.

2. **Trocar `bg-background` por `bg-slate-950`** no `AppLayout` — correcao pontual, mas nao resolve outros componentes que dependem das variaveis CSS.

### Plano recomendado

Adicionar `class="dark"` ao `<html>` no `index.html`. Isso ativa o tema escuro globalmente e faz todas as variaveis CSS (`--background`, `--foreground`, `--card`, etc.) usarem os valores da classe `.dark` definidos no `index.css`.

### Alteracao

**Arquivo:** `index.html`
- Trocar `<html lang="en">` por `<html lang="pt-BR" class="dark">`

Isso resolve o fundo branco em todas as paginas de uma vez.

