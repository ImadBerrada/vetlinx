"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { apiFetch } from "@/lib/client-api";
import {
  organizationIdFromWorkspace,
  organizationWorkspace,
  readWorkspacePreference,
  writeWorkspacePreference,
} from "@/lib/workspace-preference";
import type { ApiAppointment } from "@/lib/server/vetlinx-api";
import { useSession } from "./use-session";
import {
  AppointmentList,
  type AppointmentProposalInput,
} from "./AppointmentList";
import styles from "./Consumer.module.css";

export function ClinicAppointments() {
  const { session, error } = useSession();
  const [organizationId, setOrganizationId] = useState("");
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedId, setLoadedId] = useState("");
  const [message, setMessage] = useState("");
  const memberships =
    session?.organizations.filter(
      (item) =>
        ["CLINIC", "HOSPITAL"].includes(item.organization.type) &&
        ["OWNER", "ADMIN", "STAFF"].includes(item.role),
    ) ?? [];
  const preferred = organizationIdFromWorkspace(readWorkspacePreference());
  const selectedId =
    organizationId ||
    (
      memberships.find((item) => item.organization.id === preferred) ??
      memberships[0]
    )?.organization.id ||
    "";
  const membership = memberships.find(
    (item) => item.organization.id === selectedId,
  );
  const enabled =
    enabledOverride ??
    membership?.organization.acceptsAppointmentRequests ??
    false;
  const reload = useCallback(async (id: string) => {
    const data = await apiFetch<{ appointments: ApiAppointment[] }>(
      `/api/organizations/${id}/appointments`,
    );
    return data.appointments;
  }, []);
  useEffect(() => {
    if (!selectedId || membership?.organization.status !== "VERIFIED") return;
    let active = true;
    void reload(selectedId)
      .then((data) => {
        if (active) {
          setAppointments(data);
          setLoadedId(selectedId);
        }
      })
      .catch((failure: unknown) => {
        if (active)
          setMessage(
            failure instanceof Error
              ? failure.message
              : "Requests could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [selectedId, membership?.organization.status, reload]);
  function select(id: string) {
    setOrganizationId(id);
    setAppointments([]);
    setMessage("");
    setEnabledOverride(null);
    writeWorkspacePreference(organizationWorkspace(id));
  }
  async function toggle() {
    setPending(true);
    setMessage("");
    try {
      await apiFetch(`/api/organizations/${selectedId}/booking`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !enabled }),
      });
      setEnabledOverride(!enabled);
      window.dispatchEvent(new Event("vetlinx:session-changed"));
    } catch (failure) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "Availability could not be updated.",
      );
    } finally {
      setPending(false);
    }
  }
  async function decide(
    appointment: ApiAppointment,
    status: ApiAppointment["status"],
    reason?: string,
  ) {
    setPending(true);
    setMessage("");
    try {
      await apiFetch(
        `/api/organizations/${selectedId}/appointments/${appointment.id}`,
        { method: "PATCH", body: JSON.stringify({ status, reason }) },
      );
      setAppointments(await reload(selectedId));
    } catch (failure) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "Appointment could not be updated.",
      );
    } finally {
      setPending(false);
    }
  }
  async function propose(
    appointment: ApiAppointment,
    proposal: AppointmentProposalInput,
  ) {
    setPending(true);
    setMessage("");
    try {
      await apiFetch(
        `/api/organizations/${selectedId}/appointments/${appointment.id}/proposal`,
        { method: "POST", body: JSON.stringify(proposal) },
      );
      setAppointments(await reload(selectedId));
      return true;
    } catch (failure) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "The proposed time could not be sent.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }
  async function refresh() {
    setLoading(true);
    setMessage("");
    try {
      setAppointments(await reload(selectedId));
      setLoadedId(selectedId);
    } catch (failure) {
      setMessage(
        failure instanceof Error ? failure.message : "Could not refresh.",
      );
    } finally {
      setLoading(false);
    }
  }
  if (!session)
    return (
      <main className={styles.loading}>
        {error || "Loading your clinic workspace…"}
      </main>
    );
  return (
    <AppShell
      scope="employer"
      title="Clinic appointments"
      description="Review pet-owner requests and confirm appointment times."
    >
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      {!memberships.length ? (
        <div className={styles.empty}>
          <h3>A clinic workspace is required</h3>
          <p>
            Clinic owners, administrators, and staff can handle appointment
            requests.
          </p>
          <Link className={styles.primary} href="/employer">
            Open organization workspace
          </Link>
        </div>
      ) : (
        <>
          <label className={styles.form}>
            Clinic
            <select
              value={selectedId}
              onChange={(event) => select(event.target.value)}
              disabled={pending || loading}
            >
              {memberships.map((item) => (
                <option value={item.organization.id} key={item.organization.id}>
                  {item.organization.publicName ?? item.organization.legalName}
                </option>
              ))}
            </select>
          </label>
          {membership?.organization.status !== "VERIFIED" ? (
            <div className={styles.empty}>
              <h3>Verify your clinic first</h3>
              <p>
                Verified clinics can publish their public details and accept
                pet-owner requests.
              </p>
              <Link className={styles.primary} href="/employer">
                Review organization setup
              </Link>
            </div>
          ) : (
            <>
              <section className={styles.preferences}>
                <div>
                  <h2>
                    {enabled
                      ? "Accepting appointment requests"
                      : "Appointment requests are off"}
                  </h2>
                  <p>
                    Enabling requests publishes your clinic name, city, address,
                    and phone number in the public clinic directory. Your team
                    confirms each requested time.
                  </p>
                </div>
                {membership && ["OWNER", "ADMIN"].includes(membership.role) ? (
                  <button
                    className={styles.primary}
                    disabled={pending}
                    onClick={() => void toggle()}
                  >
                    {enabled
                      ? "Stop new requests"
                      : "Enable appointment requests"}
                  </button>
                ) : null}
              </section>
              <div className={styles.sectionHead}>
                <h2>Pet-owner requests</h2>
                <button
                  className={styles.secondary}
                  disabled={pending || loading}
                  onClick={() => void refresh()}
                >
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              {loadedId === selectedId ? (
                <AppointmentList
                  appointments={appointments}
                  clinic
                  pending={pending}
                  onAction={decide}
                  onPropose={propose}
                />
              ) : !message ? (
                <p className={styles.loading}>Loading pet-owner requests…</p>
              ) : null}
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
