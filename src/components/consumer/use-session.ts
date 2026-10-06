"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/client-api";
import type { ApiOwnerProfile, ApiProfessionalProfile, ApiOrganizationMembershipSummary, ApiSystemRole } from "@/lib/server/vetlinx-api";
import { authEntryHref } from "@/lib/auth-navigation";

export interface ConsumerSession {
  account: { accountId: string; email: string; roles: ApiSystemRole[] };
  profile: ApiProfessionalProfile | null;
  owner: ApiOwnerProfile | null;
  organizations: ApiOrganizationMembershipSummary[];
}

export function useSession() {
  const router = useRouter();
  const [session, setSession] = useState<ConsumerSession | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiFetch<ConsumerSession>("/api/session/me").then((value) => { if (active) setSession(value); }).catch((failure: unknown) => {
      if (!active) return;
      if (failure instanceof ApiRequestError && failure.status === 401) router.replace(authEntryHref("login", {
        intent: window.location.pathname.startsWith("/owner") || window.location.pathname === "/clinics" ? "owner" : null,
        returnTo: `${window.location.pathname}${window.location.search}`,
      }));
      else setError(failure instanceof Error ? failure.message : "Your account could not be loaded.");
    });
    return () => { active = false; };
  }, [router]);
  return { session, error };
}
