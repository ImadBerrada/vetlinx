export const WORKSPACE_PREFERENCE_KEY = "vetlinx.active-workspace";
export const WORKSPACE_PREFERENCE_COOKIE = "vetlinx_workspace";

export type WorkspacePreference =
  | "personal"
  | "trust"
  | `organization:${string}`;

export function organizationWorkspace(organizationId: string): WorkspacePreference {
  return `organization:${organizationId}`;
}

export function organizationIdFromWorkspace(
  preference: string | null | undefined,
): string | null {
  if (!preference?.startsWith("organization:")) return null;
  return preference.slice("organization:".length) || null;
}

export function readWorkspacePreference(): WorkspacePreference | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(
      WORKSPACE_PREFERENCE_KEY,
    ) as WorkspacePreference | null;
  } catch {
    return null;
  }
}

export function writeWorkspacePreference(preference: WorkspacePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKSPACE_PREFERENCE_KEY, preference);
  } catch {
    // Routing still works when storage is unavailable.
  }
  document.cookie = `${WORKSPACE_PREFERENCE_COOKIE}=${encodeURIComponent(preference)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.dispatchEvent(
    new CustomEvent("vetlinx:workspace-changed", { detail: preference }),
  );
}
