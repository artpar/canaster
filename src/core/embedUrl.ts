export type EmbedProvider = 'web' | 'video' | 'map' | 'doc';
export type EmbedAspectRatio = '16:9' | '4:3' | 'auto';

export function normalizeEmbedUrl(raw: string, options: { allowLocalHttp?: boolean } = {}): string | null {
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol === 'https:') return url.href;
  if (options.allowLocalHttp && url.protocol === 'http:' && isLocalHost(url.hostname)) return url.href;
  return null;
}

export function isEmbeddableUrl(raw: string, options: { allowLocalHttp?: boolean } = {}): boolean {
  return Boolean(normalizeEmbedUrl(raw, options));
}

export function embedFrameUrlForUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const videoId = url.pathname.split('/').filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : url.href;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const videoId = url.searchParams.get('v');
      return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : url.href;
    }
    if (host === 'vimeo.com') {
      const videoId = url.pathname.split('/').filter(Boolean)[0];
      return videoId ? `https://player.vimeo.com/video/${encodeURIComponent(videoId)}` : url.href;
    }
    return url.href;
  } catch {
    return raw;
  }
}

export function embedTitleForUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return url.hostname.replace(/^www\./, '') || 'Web link';
  } catch {
    return 'Web link';
  }
}

export function embedProviderForUrl(raw: string): EmbedProvider {
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be') || host.includes('vimeo.com')) return 'video';
    if (host.includes('maps.google.') || host.includes('openstreetmap.org')) return 'map';
    if (host.includes('docs.google.') || host.includes('notion.site')) return 'doc';
  } catch {
    return 'web';
  }
  return 'web';
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
