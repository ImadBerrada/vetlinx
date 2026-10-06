/** Browser mutation policy; headerless non-browser clients remain supported. */
export function isSameOriginMutation(
  request: Request,
  publicOrigin = process.env.VETLINX_PUBLIC_ORIGIN,
): boolean {
  // TLS terminates at the hosting proxy, so the internal request URL can use
  // HTTP. Use a configured public origin rather than trusting forwarded headers.
  let expectedOrigin: string;
  try {
    const target = new URL(publicOrigin ?? request.url);
    if (target.protocol !== "https:" && target.protocol !== "http:") return false;
    expectedOrigin = target.origin;
  } catch { return false; }
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
