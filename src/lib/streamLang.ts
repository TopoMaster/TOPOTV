/**
 * Idiomas de un enlace de Cine y series a partir de lo que cuenta el addon en su nombre y descripción:
 * banderas (🇪🇸 🇬🇧…), palabras («Castellano», «Latino», «Multi», «VOSE», «Dual») y listas de subtítulos
 * («Sub En Fr Es…»). No es infalible: si el addon no lo indica, se queda vacío.
 */
const CODE: Record<string, string> = {
  en: 'Inglés', eng: 'Inglés', es: 'Español', esp: 'Español', spa: 'Español', fr: 'Francés', fre: 'Francés', fra: 'Francés',
  ge: 'Alemán', ger: 'Alemán', de: 'Alemán', deu: 'Alemán', it: 'Italiano', ita: 'Italiano', pt: 'Portugués', por: 'Portugués',
  pb: 'Portugués (Brasil)', ptbr: 'Portugués (Brasil)', ru: 'Ruso', rus: 'Ruso', nl: 'Neerlandés', dut: 'Neerlandés', nld: 'Neerlandés',
  pl: 'Polaco', pol: 'Polaco', ja: 'Japonés', jp: 'Japonés', jpn: 'Japonés', ko: 'Coreano', kor: 'Coreano', zh: 'Chino', chi: 'Chino',
  chs: 'Chino', zho: 'Chino', ar: 'Árabe', ara: 'Árabe', tr: 'Turco', tur: 'Turco', sv: 'Sueco', swe: 'Sueco', no: 'Noruego', nor: 'Noruego',
  da: 'Danés', dan: 'Danés', fi: 'Finés', fin: 'Finés', cs: 'Checo', cze: 'Checo', ces: 'Checo', hu: 'Húngaro', hun: 'Húngaro',
  el: 'Griego', gre: 'Griego', ro: 'Rumano', rum: 'Rumano', ron: 'Rumano', he: 'Hebreo', heb: 'Hebreo', hi: 'Hindi', hin: 'Hindi',
  uk: 'Ucraniano', ukr: 'Ucraniano', ca: 'Catalán', cat: 'Catalán', eu: 'Euskera', baq: 'Euskera', gl: 'Gallego', glg: 'Gallego',
  lat: 'Español (Latino)', 'es-419': 'Español (Latino)', 'es-mx': 'Español (Latino)', 'pt-br': 'Portugués (Brasil)',
};
const FLAG: Record<string, string> = {
  ES: 'Español', MX: 'Español (Latino)', AR: 'Español (Latino)', CO: 'Español (Latino)', CL: 'Español (Latino)', PE: 'Español (Latino)', VE: 'Español (Latino)',
  GB: 'Inglés', US: 'Inglés', AU: 'Inglés', FR: 'Francés', IT: 'Italiano', DE: 'Alemán', AT: 'Alemán', PT: 'Portugués', BR: 'Portugués (Brasil)',
  RU: 'Ruso', UA: 'Ucraniano', PL: 'Polaco', NL: 'Neerlandés', JP: 'Japonés', KR: 'Coreano', CN: 'Chino', TW: 'Chino', HK: 'Chino', IN: 'Hindi',
  TR: 'Turco', SE: 'Sueco', NO: 'Noruego', DK: 'Danés', FI: 'Finés', CZ: 'Checo', HU: 'Húngaro', GR: 'Griego', RO: 'Rumano', IL: 'Hebreo',
  SA: 'Árabe', AE: 'Árabe', TH: 'Tailandés', VN: 'Vietnamita', ID: 'Indonesio',
};
const WORDS: [RegExp, string][] = [
  [/\b(castellano|espa[nñ]ol|spanish|cast)\b/i, 'Español'], [/\b(latino|latam|lat)\b/i, 'Español (Latino)'],
  [/\b(english|ingl[eé]s)\b/i, 'Inglés'], [/\b(french|fran[cç]ais|truefrench|vff?)\b/i, 'Francés'], [/\b(italian|italiano)\b/i, 'Italiano'],
  [/\b(german|deutsch)\b/i, 'Alemán'], [/\b(russian)\b/i, 'Ruso'], [/\b(japanese)\b/i, 'Japonés'], [/\b(korean)\b/i, 'Coreano'],
  [/\b(portuguese|portugu[eê]s)\b/i, 'Portugués'], [/\bcatal[aà]n?\b/i, 'Catalán'],
];

/** 🇪🇸 → «ES» */
function flags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/gu)) {
    out.push(String.fromCharCode(m[1].codePointAt(0)! - 0x1F1E6 + 65, m[2].codePointAt(0)! - 0x1F1E6 + 65));
  }
  return out;
}
const uniq = (a: string[]) => [...new Set(a)];

/** Nombre del idioma de un código de subtítulos de un addon («spa», «en», «pt-BR»…). */
export const langName = (code: string) => CODE[code.toLowerCase()] ?? CODE[code.toLowerCase().slice(0, 3)] ?? CODE[code.toLowerCase().slice(0, 2)] ?? code.toUpperCase();

export function detectLanguages(text: string): { audio: string[]; subs: string[]; multi: boolean } {
  const t = text.replace(/[._]/g, ' ');
  const subs: string[] = [];
  // «Sub En Fr Ge Es…», «Subs: spa/eng», «Subtítulos ES»
  const sm = t.match(/\b(?:multi[\s-]?)?sub(?:s|titles|titulos|títulos|titulado|tituladas?|bed)?\b[\s:.\-]*((?:\b[a-z]{2,3}\b[\s,/|+-]*){1,15})/i);
  if (sm) for (const c of sm[1].split(/[\s,/|+-]+/)) if (CODE[c.toLowerCase()]) subs.push(CODE[c.toLowerCase()]);
  if (/\bvose\b/i.test(t)) subs.push('Español');
  if (/\bmulti[\s-]?subs?\b/i.test(t) && !subs.length) subs.push('Varios idiomas');
  if (/\be-?subs?\b/i.test(t)) subs.push('Inglés');
  // audio: banderas y palabras (lo que va tras «sub» ya se contó como subtítulos)
  const beforeSubs = sm ? t.slice(0, sm.index) : t;
  const audio = [...flags(beforeSubs).map(c => FLAG[c]).filter(Boolean), ...WORDS.filter(([re]) => re.test(beforeSubs)).map(([, n]) => n)];
  if (/\b(eng|spa|esp|ita|fre|fra|ger|rus|jap|jpn|kor|por|lat)\b/i.test(beforeSubs)) {
    for (const m of beforeSubs.matchAll(/\b(eng|spa|esp|ita|fre|fra|ger|rus|jap|jpn|kor|por|lat)\b/gi)) audio.push(CODE[m[1].toLowerCase()] ?? '');
  }
  const multi = /\b(multi|dual)(?:[\s-]?audio)?\b/i.test(beforeSubs) && !/\bmulti[\s-]?subs?\b/i.test(beforeSubs);
  return { audio: uniq(audio.filter(Boolean)), subs: uniq(subs), multi };
}

/** ¿El idioma (nombre) es el del usuario? «es» incluye español de España y latino. */
export function isUserLang(name: string, code: string): boolean {
  const n = langName(code);
  return name === n || (code === 'es' && name.startsWith('Español')) || (code === 'pt' && name.startsWith('Portugués'));
}
