UPDATE public.agents 
SET system_prompt = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(system_prompt,
        'pelo app APet com a nota fiscal',
        'pelo site com a nota fiscal'
      ),
      'pelo app APet.',
      'pelo site.'
    ),
    '- **App:** APet (disponível na App Store e Google Play)',
    '- **Site:** https://orbepet.com.br (contratação e gestão de planos)'
  ),
  'Angelus/APet (empresa parceira responsável pela gest',
  'Angelus (empresa parceira responsável pela gest'
),
updated_at = now()
WHERE id = 'f1dc66a9-6036-423a-91cb-58b8dee9c7f2';