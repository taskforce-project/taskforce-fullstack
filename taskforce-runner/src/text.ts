/**
 * Couper un texte qui part au dossier ou à TaskForce (R159, L4) : sur une frontière de caractère, jamais au milieu
 * d'une paire de substitution (le serveur en ferait U+FFFD), et en le disant, pour qu'un lecteur sache qu'il manque une
 * partie. Les bornes sont en unités UTF-16, comme celles du serveur ; la marque compte les caractères.
 */

const high = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const low = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** Le début du texte, au plus `max` unités (une borne plus courte que la marque ne garde que la marque), la coupe marquée à la fin. */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const mark = `\n[TaskForce cut this text here: ${[...text].length} characters in all]`;
  let end = Math.max(0, max - mark.length);
  if (end > 0 && high(text.charCodeAt(end - 1))) end--;
  return `${text.slice(0, end)}${mark}`;
}

/** La fin du texte, au plus `max` unités, la coupe marquée au début. */
export function cutEnd(text: string, max: number): string {
  if (text.length <= max) return text;
  const mark = "[TaskForce cut the start of this text] ";
  let start = text.length - Math.max(0, max - mark.length);
  if (start < text.length && low(text.charCodeAt(start))) start++;
  return `${mark}${text.slice(start)}`;
}
