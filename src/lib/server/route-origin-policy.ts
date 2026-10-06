/** Browser mutation policy; headerless non-browser clients remain supported. */
export function isSameOriginMutation(request: Request): boolean {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === expectedOrigin;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const referrer = request.headers.get("referer");
  if (referrer) {
    try { return new URL(referrer).origin === expectedOrigin; }
    catch { return false; }
  }
  return true;
}
