export function novelRoute(sourceId: string, path: string): string {
  return `/novel/${encodeURIComponent(sourceId)}/${encodeURIComponent(path)}`;
}

export function readerRoute(
  sourceId: string,
  novelPath: string,
  chapterIndex: number
): string {
  return `/read/${encodeURIComponent(sourceId)}/${encodeURIComponent(novelPath)}/${chapterIndex}`;
}

export function parseRouteSegment(seg: string | undefined): string {
  if (!seg) return '';
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
