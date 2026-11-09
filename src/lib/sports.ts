const SPORT_EMOJI: Record<string, string> = {
  'fútbol': '⚽', 'fútbol sala': '⚽', 'baloncesto': '🏀', 'tenis': '🎾', 'automovilismo': '🏎️', 'motor': '🏎️', 'ciclismo': '🚴',
  'rugby': '🏉', 'fútbol americano': '🏈', 'béisbol': '⚾', 'hockey patines': '🏒', 'hockey': '🏒', 'golf': '⛳', 'boxeo': '🥊',
  'deportes de invierno': '⛷️', 'hípica': '🏇', 'snooker': '🎱', 'gimnasia': '🤸', 'patinaje artístico': '⛸️', 'escalada deportiva': '🧗',
};
export const emoji = (s: string) => SPORT_EMOJI[s.toLowerCase()] ?? '🏅';

const SPORT_COLOR: Record<string, string> = {
  'fútbol': '#2fa866', 'fútbol sala': '#2fa866', 'baloncesto': '#f08a3c', 'tenis': '#c5d43a', 'automovilismo': '#ef4b4b', 'motor': '#ef4b4b',
  'ciclismo': '#e5c035', 'rugby': '#8e6fd1', 'fútbol americano': '#b7773f', 'béisbol': '#4a90d9', 'golf': '#2bb3a0', 'boxeo': '#d94a7a',
  'deportes de invierno': '#66b6e8', 'hípica': '#a77c52', 'snooker': '#3fa34d',
};
/** Color de acento por deporte (bordes y degradados). */
export const sportColor = (s: string) => SPORT_COLOR[s.toLowerCase()] ?? '#e2c97e';
