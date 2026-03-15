

## Botão Flutuante de WhatsApp nas Landing Pages

Adicionar um botão flutuante fixo no canto inferior direito de todas as landing pages públicas, direcionando para o WhatsApp `+55 43 9156-2099` com mensagem personalizada baseada no título/slug da página.

### Implementação

**Arquivo: `src/components/landing-pages/LandingPagePublic.tsx`**

- Adicionar um `<a>` fixo (`fixed bottom-6 right-6`) com ícone do WhatsApp (SVG verde)
- Link: `https://wa.me/5543991562099?text=...`
- Mensagem personalizada usando o título da landing page:
  ```
  Olá! Vim pela página "{page.title}" e gostaria de saber mais sobre os planos OrbePet 🐾
  ```
- Isso permite ao agente identificar imediatamente a origem do lead
- Animação sutil de pulse para chamar atenção
- Z-index alto para ficar acima de todo conteúdo
- Responsivo: tamanho menor no mobile

Apenas 1 arquivo modificado, sem tabelas, sem edge functions.

