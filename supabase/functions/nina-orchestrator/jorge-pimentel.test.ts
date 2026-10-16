import { stripFabricatedActions } from './index.ts';

Deno.test('remove promessa inventada de reenvio de PDF', () => {
  const out = stripFabricatedActions('Pode ser algum erro no servidor, acabei de reenviar o PDF agora mesmo. Dá uma olhadinha no spam.');
  if (/reenvi/i.test(out)) throw new Error(out);
});

Deno.test('resposta só com "segue o arquivo" fica vazia', () => {
  const out = stripFabricatedActions('Segue o arquivo com a proposta detalhada.');
  if (out !== '') throw new Error(out);
});

Deno.test('texto normal passa intacto', () => {
  const t = 'Na maioria dos fretes, quem emite o CT-e: você ou a transportadora?';
  if (stripFabricatedActions(t) !== t) throw new Error('alterou');
});
