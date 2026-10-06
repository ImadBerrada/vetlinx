import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { callAuthenticatedApi, clearSessionCookies, setSessionCookies } from "@/lib/server/session";
import { callApi, readJson, type ApiOwnerProfile, type ApiOrganizationMembershipSummary, type ApiProfessionalProfile, type ApiSystemRole } from "@/lib/server/vetlinx-api";

export async function GET() {
  try {
    const result = await callAuthenticatedApi("/api/v1/auth/me");
    if (!result.response.ok) {
      const response = NextResponse.json({ message: result.response.status === 401 ? "Sign in required." : "Your account could not be loaded." }, { status: result.response.status });
      if (result.response.status === 401) clearSessionCookies(response);
      return response;
    }
    const account = await readJson<{ accountId: string; email: string; roles: ApiSystemRole[] }>(result.response);
    const token = result.rotatedSession?.accessToken ?? (await cookies()).get("vetlinx_access")?.value;
    const [professional, owner, organizations] = await Promise.all([
      callApi("/api/v1/professionals/me", { headers: { authorization: `Bearer ${token}` } }),
      callApi("/api/v1/owners/me", { headers: { authorization: `Bearer ${token}` } }),
      callApi("/api/v1/organizations/me", { headers: { authorization: `Bearer ${token}` } }),
    ]);
    if ([professional, owner, organizations].some((workspace) => workspace.status === 401)) {
      const response = NextResponse.json({ message: "Sign in required." }, { status: 401 });
      clearSessionCookies(response);
      return response;
    }
    if ((!professional.ok && professional.status !== 404) || (!owner.ok && owner.status !== 404) || !organizations.ok) {
      const response = NextResponse.json({ message: "Your workspaces could not be loaded. Try again." }, { status: 503 });
      if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
      return response;
    }
    const response = NextResponse.json({ account, profile: professional.ok ? await readJson<ApiProfessionalProfile>(professional) : null, owner: owner.ok ? await readJson<ApiOwnerProfile>(owner) : null, organizations: await readJson<ApiOrganizationMembershipSummary[]>(organizations) ?? [] });
    if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
    return response;
  } catch {
    return NextResponse.json({ message: "VetLinX could not be reached. Try again." }, { status: 503 });
  }
}
