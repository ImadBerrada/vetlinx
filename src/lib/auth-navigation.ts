export type WorkspaceIntent = "owner" | "professional";

export interface AuthNavigationContext {
  intent: WorkspaceIntent | null;
  returnTo: string | null;
}

/** Accept only local application destinations, never APIs or authentication loops. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null;
  const destination = new URL(value, "https://vetlinx.local");
  if (destination.origin !== "https://vetlinx.local") return null;
  const paths = ["/professional", "/owner", "/clinics", "/get-started", "/onboarding", "/credentials", "/portfolio", "/jobs", "/applications", "/employer", "/review", "/settings"];
  if (destination.pathname !== "/" && !paths.some((path) => destination.pathname === path || destination.pathname.startsWith(`${path}/`))) return null;
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function authNavigationContext(search: string): AuthNavigationContext {
  const params = new URLSearchParams(search);
  const value = params.get("intent");
  return { intent: value === "owner" || value === "professional" ? value : null, returnTo: safeReturnTo(params.get("returnTo")) };
}

export function authNavigationFromParams(params: Record<string, string | string[] | undefined>): AuthNavigationContext {
  const intent = params.intent;
  return { intent: intent === "owner" || intent === "professional" ? intent : null, returnTo: typeof params.returnTo === "string" ? safeReturnTo(params.returnTo) : null };
}

export function withReturnTo(path: string, returnTo: string | null | undefined): string {
  const destination = safeReturnTo(returnTo);
  if (!destination) return path;
  const url = new URL(path, "https://vetlinx.local");
  url.searchParams.set("returnTo", destination);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function authEntryHref(mode: "login" | "register", options: { intent?: WorkspaceIntent | null; returnTo?: string | null } = {}) {
  const params = new URLSearchParams();
  if (options.intent) params.set("intent", options.intent);
  const returnTo = safeReturnTo(options.returnTo);
  if (returnTo) params.set("returnTo", returnTo);
  return `/${mode}${params.size ? `?${params}` : ""}`;
}
