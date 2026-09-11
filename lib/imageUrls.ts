export function parsePastedImageUrls(raw: string) {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const value = part.trim();
    if (!value || seen.has(value)) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      seen.add(value);
      urls.push(value);
    } catch {
      /* skip */
    }
  }
  return urls.slice(0, 4);
}

export function canUseNextImage(src: string) {
  if (src.startsWith("data:") || src.startsWith("blob:")) return false;
  try {
    const host = new URL(src).hostname;
    return host === "images.unsplash.com" || host.endsWith(".supabase.co");
  } catch {
    return false;
  }
}
