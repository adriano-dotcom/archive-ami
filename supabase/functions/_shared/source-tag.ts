const TAG_RE = /\s*\[(M|G):([^\]\[]*)\]\s*/;
function val(v?: string): string | null { const s = (v ?? '').replace(/\s+/g, ' ').trim(); return !s || s === '-' ? null : s.slice(0, 255); }
export interface SourceTagResult { cleanText: string; kind: 'M' | 'G' | null; utmSource?: string; utmCampaign?: string | null; utmContent?: string | null; utmTerm?: string | null; clid?: string | null; }
export function parseSourceTag(text: string | null | undefined): SourceTagResult {
  const raw = text ?? ''; const m = raw.match(TAG_RE);
  if (!m) return { cleanText: raw, kind: null };
  const p = m[2].split('|');
  const cleanText = raw.replace(TAG_RE, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { cleanText, kind: m[1] as 'M' | 'G', utmSource: m[1] === 'M' ? 'facebook' : 'google', utmCampaign: val(p[0]), utmContent: val(p[1]), utmTerm: val(p[2]), clid: (val(p[3]) ?? '').replace(/[^A-Za-z0-9_-]/g, '') || null };
}
