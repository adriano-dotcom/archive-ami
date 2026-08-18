# Validação de e-mail no login e na recuperação de senha

Hoje os formulários da tela de acesso só checam se o campo está preenchido. Um e-mail digitado errado (sem "@", com espaço, com domínio incompleto) é enviado para o backend e o usuário recebe uma mensagem genérica, sem entender que o erro está no e-mail.

## O que muda

1. **Login** — antes de enviar, o e-mail é validado. Se estiver em branco ou inválido, aparece a mensagem sob o campo ("Informe um e-mail válido, ex.: nome@empresa.com.br") e a requisição não é feita.

2. **Cadastro** — mesma validação de e-mail, somada à validação de senha que já existe.

3. **Recuperar senha** — o campo do modal passa a mostrar erro inline quando o e-mail é inválido ou vazio, e o botão "Enviar" só habilita com e-mail válido. Hoje ele habilita com qualquer texto digitado.

4. **Mensagens de erro mais claras** na recuperação: além do erro de formato, tratar o limite de envios do provedor ("Aguarde alguns minutos antes de pedir outro link") em vez de exibir o texto técnico.

5. **Confirmação de envio** — por segurança, a mensagem de sucesso continua genérica (não revela se o e-mail existe), mas passa a orientar a checar a caixa de spam.

## Regras de validação

- Obrigatório, sem espaços nas pontas, no máximo 255 caracteres.
- Formato de e-mail válido.
- Erro exibido abaixo do campo (não só em toast) e limpo assim que o usuário corrige.

## Detalhes técnicos

- `src/pages/Auth.tsx`: criar um schema `zod` (`z.string().trim().email().max(255)`) reutilizado por `handleLogin`, `handleSignUp` e `handlePasswordReset`; estados `emailError` e `resetEmailError`; `aria-invalid` e `aria-describedby` nos inputs para acessibilidade; `disabled` do botão "Enviar" passa a considerar o e-mail válido.
- `zod` já está no projeto — sem dependências novas.

## Sobre "não consegue entrar / não recebe nova senha"

A validação acima resolve os envios com e-mail inválido ou em branco. Se o problema for outro (o e-mail chega mas o link não abre a tela de nova senha, ou o e-mail não chega), o diagnóstico é diferente e ainda não está confirmado. Passo extra deste plano: verificar, com o e-mail real do usuário afetado, se o link de recuperação está sendo entregue e se ao abri-lo a tela de definir nova senha aparece — e, se falhar, reportar a causa antes de mexer nesse fluxo.
