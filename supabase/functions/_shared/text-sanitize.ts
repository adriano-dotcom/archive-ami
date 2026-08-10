/**
 * Sanitização de texto de saída — REGRA DA EMPRESA: nunca enviar emoji para contatos.
 *
 * Remove emojis/pictogramas (incluindo variantes, bandeiras e sequências ZWJ),
 * preservando acentos, quebras de linha, formatação do WhatsApp (*negrito*) e links.
 */

const EMOJI_PATTERN =
  /(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)|(?:\p{Regional_Indicator}{2})|[\u{1F3FB}-\u{1F3FF}]|[\u{E0020}-\u{E007F}]|\uFE0F|\u200D/gu;

/** Remove emojis e normaliza os espaços resultantes. */
export function stripEmojis(text: string | null | undefined): string {
  if (!text) return text ?? '';

  let out = text.replace(EMOJI_PATTERN, '');

  // Normaliza sobras de espaçamento sem destruir quebras de linha
  out = out
    .replace(/[ \t]{2,}/g, ' ')          // espaços duplicados
    .replace(/[ \t]+([,.!?;:])/g, '$1')  // espaço antes de pontuação
    .replace(/[ \t]+\n/g, '\n')          // espaço no fim da linha
    .replace(/\n[ \t]+/g, '\n')          // espaço no início da linha
    .replace(/\n{3,}/g, '\n\n');         // excesso de linhas vazias

  return out.trim();
}

/** Versão segura para campos opcionais (mantém undefined quando vazio). */
export function stripEmojisOptional(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const cleaned = stripEmojis(text);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Remove emojis do HTML de e-mails (o padrão não afeta tags nem entidades). */
export function stripEmojisHtml(html: string | null | undefined): string {
  return stripEmojis(html);
}
