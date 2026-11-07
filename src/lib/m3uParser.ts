import type { Channel, Group, M3UMeta, ParsedM3U, Stream } from '@/types';
function slugify(t: string) { return t.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-+/g,'-').trim(); }
function extractAceId(url: string) { return url.match(/[?&]id=([a-f0-9]+)/i)?.[1] ?? ''; }
function extractProvider(label: string) { return label.match(/-->\s*(.+)$/)?.[1]?.trim() ?? 'DEFAULT'; }
function cleanName(raw: string) {
  return raw.replace(/\s*-->.*$/,'').replace(/[\s*]+$/,'').replace(/\s+(4K|2160p|1080p|720p|576p|480p|FHD|HD|SD)\s*$/i,'').replace(/[\s*]+$/,'').trim() || raw.trim();
}
function buildId(tvgId: string, group: string, name: string) { return tvgId?.trim() ? slugify(tvgId) : slugify(group+'-'+name); }
function parseHeader(line: string): Partial<M3UMeta> {
  const epgMatch = line.match(/url-tvg="([^"]+)"/);
  return { epgUrls: epgMatch ? epgMatch[1].split(',').map(s=>s.trim()) : [], refreshInterval: 3600 };
}
export function parseM3U(content: string, source = 'unknown'): ParsedM3U {
  const lines = content.split('\n').map(l=>l.trim()).filter(Boolean);
  if (!lines[0]?.startsWith('#EXTM3U')) throw new Error('Archivo M3U inválido');
  const meta: M3UMeta = { epgUrls:[], refreshInterval:3600, loadedAt:new Date(), source, ...parseHeader(lines[0]) };
  const channelMap = new Map<string, Channel>();
  const groupOrder: string[] = [];
  const groupMap = new Map<string, Group>();
  let i = 1;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith('#EXTINF:')) { i++; continue; }
    const tvgLogo = line.match(/tvg-logo="([^"]*)"/)?.[1] ?? '';
    const tvgId = line.match(/tvg-id="([^"]*)"/)?.[1] ?? '';
    const groupTitle = line.match(/group-title="([^"]*)"/)?.[1] ?? 'OTROS';
    const rawName = line.match(/,(.+)$/)?.[1]?.trim() ?? 'Canal';
    let url = ''; let j = i+1;
    while (j < lines.length && lines[j].startsWith('#')) j++;
    if (j < lines.length) url = lines[j];
    i = j+1;
    if (!url) continue;
    const aceId = extractAceId(url);
    if (!aceId) continue;
    const cleanName_ = cleanName(rawName);
    const channelId = buildId(tvgId, groupTitle, cleanName_);
    const stream: Stream = { aceId, url, label: rawName, provider: extractProvider(rawName) };
    if (channelMap.has(channelId)) { channelMap.get(channelId)!.streams.push(stream); }
    else {
      const ch: Channel = { id: channelId, tvgId, name: cleanName_, rawName, logo: tvgLogo, group: groupTitle, streams: [stream] };
      channelMap.set(channelId, ch);
      if (!groupMap.has(groupTitle)) { groupOrder.push(groupTitle); groupMap.set(groupTitle, { id: slugify(groupTitle), title: groupTitle, logo: '', channels: [] }); }
      groupMap.get(groupTitle)!.channels.push(ch);
    }
  }
  return { meta, groups: groupOrder.map(t=>groupMap.get(t)!), allChannels: [...channelMap.values()] };
}
export async function loadM3UFromFile(file: File): Promise<ParsedM3U> { return parseM3U(await file.text(), file.name); }
export async function loadM3UFromUrl(url: string): Promise<ParsedM3U> {
  const res = await fetch(url); if (!res.ok) throw new Error('HTTP '+res.status);
  return parseM3U(await res.text(), url);
}
