import type { ApiCredential } from "@/lib/server/vetlinx-api";
export function CredentialLifecycleHistory({
  credential,
}: {
  credential: ApiCredential;
}) {
  const history = credential.lifecycleHistory ?? [];
  if (!history.length) return null;
  return (
    <details>
      <summary>Credential validity history</summary>
      <ol>
        {history.map((entry) => (
          <li key={entry.id}>
            <p>
              <strong>
                {entry.toStatus === "EXPIRED"
                  ? "Expired"
                  : "Verification revoked"}
              </strong>{" "}
              · {new Date(entry.createdAt).toLocaleString()}
            </p>
            <p>{entry.reason}</p>
            <small>
              {entry.source === "EXPIRY_WORKER"
                ? "Recorded expiry date"
                : entry.source === "ASSIGNED_REVIEWER"
                  ? "Assigned reviewer decision"
                  : "Governed operations decision"}
            </small>
          </li>
        ))}
      </ol>
    </details>
  );
}
