UPDATE public.agents 
SET system_prompt = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(system_prompt,
            'O tutor leva o pet a qualquer veterinário do Brasil, paga a consulta, envia a nota fiscal pelo app APet e recebe o reembolso via PIX em até 7 dias úteis.',
            'O tutor leva o pet a qualquer veterinário do Brasil, paga a consulta, envia a nota fiscal pelo site e recebe o reembolso via PIX em até 7 dias úteis.'
          ),
          'PIX para a conta cadastrada no app APet',
          'PIX para a conta cadastrada'
        ),
        'Pelo app APet',
        'Pelo site'
      ),
      'Clube de vantagens APet',
      'Clube de vantagens OrbePet'
    ),
    'você pode fazer tudo pelo app APet — é rapidinho, menos de 2 minutos. Posso te enviar o link agora?"',
    E'é tudo pelo nosso site — rapidinho, menos de 2 minutos! Envie o link direto do plano escolhido:\n> - 🟣 Essencial: https://orbepet.com.br/contratar/orbita-essencial\n> - 💜 Plus: https://orbepet.com.br/contratar/orbita-plus\n> - 🏆 Total: https://orbepet.com.br/contratar/orbita-total\n> - 🌟 Galáxia: https://orbepet.com.br/contratar/orbita-galaxia\n> É só clicar no link do plano escolhido e preencher os dados! 💜"'
  ),
  'Contratação 100% digital em menos de 2 minutos',
  'Contratação 100% digital pelo site em menos de 2 minutos'
),
updated_at = now()
WHERE id = 'f1dc66a9-6036-423a-91cb-58b8dee9c7f2';