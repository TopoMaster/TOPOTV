/** Minúsculas y sin tildes: «Atlético» y «atletico» son lo mismo al buscar. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** ¿Difieren como mucho en una letra (cambiada, sobrante o que falta)? */
function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; continue; }   // dos letras cambiadas de sitio
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/**
 * ¿Coincide la búsqueda con el texto? Cada palabra de la búsqueda debe aparecer (sin tildes) como trozo de alguna
 * palabra del texto; las palabras de 4 letras o más admiten una errata.
 * Devuelve 0 si no coincide, y un valor mayor cuanto más exacta es la coincidencia.
 */
export function matchScore(query: string, text: string): number {
  const q = norm(query);
  if (!q) return 0;
  const t = norm(text);
  if (t.includes(q)) return t.startsWith(q) ? 100 : 80;
  const words = t.split(' ');
  let score = 60;
  for (const token of q.split(' ')) {
    if (words.some(w => w.includes(token))) continue;
    if (token.length >= 4 && words.some(w => w.length >= 3 && [token.length - 1, token.length, token.length + 1].some(n => within1(token, w.slice(0, n))))) { score -= 15; continue; }
    return 0;
  }
  return score;
}
