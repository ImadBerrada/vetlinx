"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { apiFetch, ApiRequestError } from "@/lib/client-api";
import { authEntryHref } from "@/lib/auth-navigation";
import { CredentialLifecycleHistory } from "@/components/credentials/CredentialLifecycleHistory";
import type { ApiCredentialLifecycleReview } from "@/lib/server/vetlinx-api";
import styles from "@/components/consumer/Consumer.module.css";
import lifecycleStyles from "./CredentialLifecycleReview.module.css";

export function CredentialLifecycleReview() {
  const router = useRouter();
  const [records, setRecords] = useState<ApiCredentialLifecycleReview[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const handleFailure = useCallback(
    (failure: unknown, fallback: string) => {
      if (failure instanceof ApiRequestError && failure.status === 401) {
        router.replace(
          authEntryHref("login", { returnTo: "/review/credentials" }),
        );
        return;
      }
      setForbidden(
        failure instanceof ApiRequestError && failure.status === 403,
      );
      setMessage(failure instanceof Error ? failure.message : fallback);
    },
    [router],
  );
  useEffect(() => {
    if (selected) reasonField.current?.focus();
  }, [selected]);
  const load = useCallback(async () => {
    const data = await apiFetch<{ records: ApiCredentialLifecycleReview[] }>(
      "/api/reviews/lifecycle",
    );
    return data.records;
  }, []);
  useEffect(() => {
    let active = true;
    void load()
      .then((data) => {
        if (active) {
          setRecords(data);
          setLoaded(true);
        }
      })
      .catch((failure: unknown) => {
        if (active)
          handleFailure(failure, "Credential validity could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [load, handleFailure]);
  async function refresh() {
    setPending(true);
    setMessage("");
    setForbidden(false);
    try {
      setRecords(await load());
      setLoaded(true);
    } catch (failure) {
      handleFailure(failure, "Could not refresh credential validity.");
    } finally {
      setPending(false);
    }
  }
  async function revoke(record: ApiCredentialLifecycleReview) {
    setPending(true);
    setMessage("");
    try {
      await apiFetch(`/api/reviews/${record.requestId}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setRecords(await load());
      setSelected(null);
      setReason("");
    } catch (failure) {
      handleFailure(failure, "The revocation could not be recorded.");
    } finally {
      setPending(false);
    }
  }
  return (
    <AppShell
      scope="review"
      title="Credential validity"
      description="Manage the current validity of previously reviewed evidence."
      actions={
        <button
          className={styles.secondary}
          disabled={pending}
          onClick={() => void refresh()}
        >
          Refresh validity
        </button>
      }
    >
      <p className={styles.muted}>
        The original review decision remains part of the record. Revocation
        records an independent, reasoned decision; it does not rewrite that
        review. Assigned reviewers manage their reviewed credentials. Operations
        administrators have governed access across reviews.
      </p>
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      {forbidden ? (
        <p>
          Trust operations require an authorized role and current two-step
          verification.{" "}
          <Link href="/settings/security/mfa">
            Review two-step verification
          </Link>
          . Contact your platform administrator if your assigned review access
          is missing.
        </p>
      ) : null}
      {!loaded && !message ? (
        <p className={styles.loading}>Loading governed credential records…</p>
      ) : loaded && !records.length ? (
        <div className={styles.empty}>
          <h2>No reviewed credentials in your scope</h2>
          <p>
            Previously approved credentials appear here when you are their
            assigned reviewer or an operations administrator.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {records.map((record) => (
            <article key={record.requestId} className={styles.appointment}>
              <header>
                <h2>{record.credential.title}</h2>
                <span
                  className={`${styles.status} ${(record.credential.effectiveStatus ?? record.credential.status) === "VERIFIED" ? "" : lifecycleStyles.invalidStatus}`}
                >
                  {(
                    record.credential.effectiveStatus ??
                    record.credential.status
                  ).toLowerCase()}
                </span>
              </header>
              <p>
                {record.professionalName} ·{" "}
                {record.credential.issuingOrganization} ·{" "}
                {record.credential.countryCode}
              </p>
              <p>
                Original review: approved
                {record.reviewedAt
                  ? ` on ${new Date(record.reviewedAt).toLocaleDateString()}`
                  : ""}
                .{" "}
                {record.credential.expiryDate
                  ? `Recorded expiry date: ${record.credential.expiryDate.slice(0, 10)} (valid through this UTC date).`
                  : "No expiry date recorded."}
              </p>
              <CredentialLifecycleHistory credential={record.credential} />
              {record.canRevoke ? (
                selected === record.requestId ? (
                  <form
                    className={`${styles.form} ${styles.requestForm}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void revoke(record);
                    }}
                  >
                    <h3>Record a credential revocation</h3>
                    <p>
                      This removes the credential from current verified claims
                      and employer discovery. The owner will be notified. The
                      reason stays in the private credential history.
                    </p>
                    <label>
                      Revocation reason
                      <textarea
                        ref={reasonField}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        required
                        minLength={10}
                        maxLength={1000}
                      />
                    </label>
                    <div className={styles.actions}>
                      <button
                        className={styles.danger}
                        disabled={pending || reason.trim().length < 10}
                      >
                        Confirm revocation
                      </button>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={pending}
                        onClick={() => {
                          setSelected(null);
                          setReason("");
                        }}
                      >
                        Keep current validity
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    className={styles.secondary}
                    disabled={pending}
                    onClick={() => {
                      setSelected(record.requestId);
                      setReason("");
                    }}
                  >
                    Revoke verification
                  </button>
                )
              ) : null}
            </article>
          ))}
        </div>
      )}
      <button
        className={styles.secondary}
        onClick={() => router.push("/review")}
      >
        Return to review queue
      </button>
    </AppShell>
  );
}
