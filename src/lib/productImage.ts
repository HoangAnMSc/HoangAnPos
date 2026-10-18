// Transform unsigned originals only; leave external, signed and already edited URLs intact.
export function productThumbnailUrl(source: string, width = 384) {
  try {
    const url = new URL(source);
    if (url.hostname !== "res.cloudinary.com" || url.search || url.hash) return source;
    const match = url.pathname.match(/^(\/[^/]+\/image\/upload\/)(.+)$/);
    if (!match || /^(?:s--|[a-z]{1,3}_)/.test(match[2])) return source;
    const size = Math.max(64, Math.min(1600, Math.round(width)));
    if (!Number.isFinite(size)) return source;
    url.pathname = `${match[1]}c_limit,w_${size},h_${size}/f_auto/q_auto/${match[2]}`;
    return url.href;
  } catch {
    return source;
  }
}
