export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiRequestError(typeof body.message === "string" ? body.message : "Your request could not be completed.", response.status);
  return body as T;
}
