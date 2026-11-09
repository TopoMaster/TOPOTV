/**
 * TDT en abierto: emisiones HLS oficiales de las televisiones públicas (RTVE y autonómicas).
 * Las cadenas privadas (Antena 3, Cuatro, Telecinco, laSexta...) emiten solo en sus propias apps
 * (Atresplayer, Mitele) con protección, así que no se incluyen aquí: ver TDT_PRIVADAS.
 * Todas las direcciones se comprobaron con respuesta 200 y cabecera CORS abierta.
 */
import { canon, logoFor } from '@/lib/ciriacoNative';

interface TdtChannel { name: string; url: string; group: 'TDT' | 'TDT AUTONÓMICAS'; logoKey?: string }

const RTVE = 'https://rtvelivestream.rtve.es/rtvesec';
const TDT: TdtChannel[] = [
  { name: 'La 1', url: `${RTVE}/la1/la1_main.m3u8`, group: 'TDT' },
  { name: 'La 2', url: `${RTVE}/la2/la2_main.m3u8`, group: 'TDT' },
  { name: '24 Horas', url: `${RTVE}/24h/24h_main.m3u8`, group: 'TDT' },
  { name: 'Teledeporte', url: `${RTVE}/tdp/tdp_main.m3u8`, group: 'TDT' },
  { name: 'Clan', url: `${RTVE}/clan/clan_main.m3u8`, group: 'TDT' },
  { name: 'TV3', url: 'https://directes3-tv-cat.3catdirectes.cat/live-content/tv3-hls/master.m3u8', group: 'TDT AUTONÓMICAS', logoKey: 'tv3 cat' },
  { name: 'Esport3', url: 'https://directes-tv-cat.3catdirectes.cat/live-content/esport3-hls/master.m3u8', group: 'TDT AUTONÓMICAS' },
  { name: '3Cat Info (324)', url: 'https://directes-tv-int.3catdirectes.cat/live-origin/canal324-hls/master.m3u8', group: 'TDT AUTONÓMICAS' },
  { name: 'ETB 1', url: 'https://cdn1.etbon.eus/etb1on/index.m3u8', group: 'TDT AUTONÓMICAS', logoKey: 'etb1' },
  { name: 'ETB 2', url: 'https://cdn1.etbon.eus/etb2on/index.m3u8', group: 'TDT AUTONÓMICAS', logoKey: 'etb2' },
  { name: 'TVG Europa', url: 'https://crtvg-europa.flumotion.cloud/playlist.m3u8', group: 'TDT AUTONÓMICAS' },
  { name: 'TVG2', url: 'https://crtvg-tvg2.flumotion.cloud/playlist.m3u8', group: 'TDT AUTONÓMICAS' },
  { name: 'Televisión Canaria', url: 'https://rtvclive.flumotion.cloud/rtvc1live/smil:channel1PRG.smil/playlist.m3u8', group: 'TDT AUTONÓMICAS', logoKey: 'television canaria' },
  { name: 'Canal Sur 2', url: 'https://cdnlive.codev8.net/rtvalive/smil:channel22.smil/playlist.m3u8', group: 'TDT AUTONÓMICAS', logoKey: 'canal sur 2' },
  { name: 'Canal Sur Noticias', url: 'https://cdnlive.codev8.net/rtvalive/smil:channel42.smil/playlist.m3u8', group: 'TDT AUTONÓMICAS', logoKey: 'canal sur 1' },
];

/** Cadenas privadas: solo se pueden ver en la web/app oficial. */
export const TDT_PRIVADAS = [
  { name: 'Antena 3, laSexta y Neox', url: 'https://www.atresplayer.com/directos/' },
  { name: 'Telecinco, Cuatro y Mediaset', url: 'https://www.mitele.es/directo/' },
  { name: 'RTVE Play (todo en directo)', url: 'https://www.rtve.es/play/directos/' },
];

/** La lista como M3U, para pasarla por el mismo parser que el resto de fuentes. */
export function tdtPlaylistText(): string {
  const lines = ['#EXTM3U'];
  for (const c of TDT) {
    const logo = logoFor(c.logoKey ?? canon(c.name));
    lines.push(`#EXTINF:-1 tvg-id="tdt-${canon(c.name).replace(/ /g, '-')}" tvg-logo="${logo}" group-title="${c.group}",${c.name}`);
    lines.push(c.url);
  }
  return lines.join('\n') + '\n';
}
