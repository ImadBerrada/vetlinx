"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PawPrint, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { apiFetch } from "@/lib/client-api";
import { writeWorkspacePreference } from "@/lib/workspace-preference";
import { authNavigationContext, withReturnTo } from "@/lib/auth-navigation";
import type { ApiPet, ApiAppointment } from "@/lib/server/vetlinx-api";
import { useSession } from "./use-session";
import { AppointmentList } from "./AppointmentList";
import styles from "./Consumer.module.css";

export function OwnerWorkspace() {
  const { session, error } = useSession();
  const router = useRouter();
  const [pets, setPets] = useState<ApiPet[]>([]);
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<ApiPet | null | undefined>();
  const [archiving, setArchiving] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [petData, appointmentData] = await Promise.all([
      apiFetch<{ pets: ApiPet[] }>("/api/pets"),
      apiFetch<{ appointments: ApiAppointment[] }>("/api/appointments"),
    ]);
    return { pets: petData.pets, appointments: appointmentData.appointments };
  }, []);
  async function refresh() {
    const data = await reload();
    setPets(data.pets);
    setAppointments(data.appointments);
    setLoaded(true);
  }
  useEffect(() => {
    if (!session) return;
    if (!session.owner) {
      router.replace(
        withReturnTo(
          "/owner/onboarding",
          authNavigationContext(window.location.search).returnTo,
        ),
      );
      return;
    }
    writeWorkspacePreference("owner");
    let active = true;
    void reload()
      .then((data) => {
        if (active) {
          setPets(data.pets);
          setAppointments(data.appointments);
          setLoaded(true);
          setReturnTo(authNavigationContext(window.location.search).returnTo);
        }
      })
      .catch((failure: unknown) => {
        if (active)
          setMessage(
            failure instanceof Error
              ? failure.message
              : "Your pets could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [session, router, reload]);

  async function savePet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      name: data.get("name"),
      speciesCode: data.get("speciesCode"),
      sex: data.get("sex"),
      breed: data.get("breed"),
      birthDate: data.get("birthDate") || (editing ? null : undefined),
    };
    setPending(true);
    setMessage("");
    try {
      await apiFetch(editing ? `/api/pets/${editing.id}` : "/api/pets", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setEditing(undefined);
      await refresh();
    } catch (failure) {
      setMessage(
        failure instanceof Error ? failure.message : "Pet could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }
  async function archive(petId: string) {
    setPending(true);
    setMessage("");
    try {
      await apiFetch(`/api/pets/${petId}/archive`, { method: "POST" });
      setArchiving(null);
      await refresh();
    } catch (failure) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "Pet could not be archived.",
      );
    } finally {
      setPending(false);
    }
  }
  async function cancel(appointment: ApiAppointment) {
    setPending(true);
    setMessage("");
    try {
      await apiFetch(`/api/appointments/${appointment.id}/cancel`, {
        method: "POST",
      });
      await refresh();
    } catch (failure) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "Request could not be cancelled.",
      );
    } finally {
      setPending(false);
    }
  }
  async function respond(appointment: ApiAppointment, accept: boolean) {
    setPending(true);
    setMessage("");
    try {
      await apiFetch(
        `/api/appointments/${appointment.id}/proposal/${accept ? "accept" : "reject"}`,
        {
          method: "POST",
          body: JSON.stringify({
            proposalVersion: appointment.proposalVersion,
          }),
        },
      );
      await refresh();
    } catch (failure) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "The proposed time could not be updated. Refresh and try again.",
      );
    } finally {
      setPending(false);
    }
  }
  if (!session?.owner)
    return (
      <main className={styles.loading}>
        {error || "Preparing your pet-owner workspace…"}
      </main>
    );
  return (
    <AppShell
      scope="owner"
      title={`Hello, ${session.owner.displayName}`}
      description="Your pets, trusted clinics, and appointment requests."
      actions={
        <Link className={styles.primary} href="/clinics">
          <Search />
          Find a clinic
        </Link>
      }
    >
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      {loaded && returnTo ? (
        <section className={styles.notice}>
          <p>
            Your selected clinic is saved.{" "}
            {pets.length
              ? "Choose your pet and review the request when you return."
              : "Add a pet, then return to your clinic request."}
          </p>
          {pets.length ? (
            <Link className={styles.primary} href={returnTo}>
              Continue your clinic request
            </Link>
          ) : null}
        </section>
      ) : null}
      {!loaded && !message ? (
        <p className={styles.loading}>Loading your pets and appointments…</p>
      ) : null}
      <div className={styles.sectionHead}>
        <h2>My pets</h2>
        <button
          className={styles.primary}
          onClick={() => setEditing(null)}
          disabled={pending}
        >
          <Plus />
          Add pet
        </button>
      </div>
      {editing !== undefined ? (
        <section
          className={`${styles.panel} ${styles.inlineForm}`}
          aria-label={editing ? "Edit pet" : "Add pet"}
        >
          <h2>{editing ? `Edit ${editing.name}` : "Add your pet"}</h2>
          <form
            className={styles.form}
            onSubmit={savePet}
            key={editing?.id ?? "new"}
          >
            <div className={styles.row}>
              <label>
                Pet name
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editing?.name ?? ""}
                />
              </label>
              <label>
                Species
                <select
                  name="speciesCode"
                  defaultValue={editing?.speciesCode ?? "DOG"}
                >
                  {["DOG", "CAT", "BIRD", "RABBIT", "HORSE", "OTHER"].map(
                    (value) => (
                      <option key={value} value={value}>
                        {value.toLowerCase()}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <div className={styles.row}>
              <label>
                Breed (optional)
                <input
                  name="breed"
                  maxLength={120}
                  defaultValue={editing?.breed ?? ""}
                />
              </label>
              <label>
                Sex
                <select name="sex" defaultValue={editing?.sex ?? "UNKNOWN"}>
                  <option value="UNKNOWN">Unknown</option>
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                </select>
              </label>
            </div>
            <label>
              Date of birth (optional)
              <input
                name="birthDate"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                defaultValue={editing?.birthDate?.slice(0, 10) ?? ""}
              />
            </label>
            <div className={styles.actions}>
              <button className={styles.primary} disabled={pending}>
                {pending ? "Saving…" : "Save pet"}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}
      {loaded && !pets.length ? (
        <div className={styles.empty}>
          <PawPrint />
          <h3>Add your first pet</h3>
          <p>
            A pet profile helps you request the right care. You can add more
            pets later.
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {pets.map((pet) => (
            <article className={styles.card} key={pet.id}>
              <PawPrint />
              <h2>{pet.name}</h2>
              <p>
                {pet.speciesCode.toLowerCase()}
                {pet.breed ? ` · ${pet.breed}` : ""} · {pet.sex.toLowerCase()}
              </p>
              {pet.birthDate ? <p>Born {pet.birthDate.slice(0, 10)}</p> : null}
              <div className={styles.actions}>
                <button
                  className={styles.secondary}
                  disabled={pending}
                  onClick={() => setEditing(pet)}
                >
                  Edit {pet.name}
                </button>
                <button
                  className={styles.secondary}
                  disabled={pending}
                  onClick={() => setArchiving(pet.id)}
                >
                  Archive {pet.name}
                </button>
              </div>
              {archiving === pet.id ? (
                <div className={styles.requestForm}>
                  <p>
                    Archive {pet.name}? Existing appointment history will be
                    kept.
                  </p>
                  <div className={styles.actions}>
                    <button
                      className={styles.danger}
                      disabled={pending}
                      onClick={() => void archive(pet.id)}
                    >
                      Confirm archive
                    </button>
                    <button
                      className={styles.secondary}
                      onClick={() => setArchiving(null)}
                    >
                      Keep pet
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
      <div className={styles.sectionHead}>
        <h2>Appointment requests</h2>
        <button
          className={styles.secondary}
          disabled={pending}
          onClick={() =>
            void refresh().catch((failure: unknown) =>
              setMessage(
                failure instanceof Error
                  ? failure.message
                  : "Could not refresh.",
              ),
            )
          }
        >
          Refresh
        </button>
      </div>
      {loaded ? (
        <AppointmentList
          appointments={appointments}
          pending={pending}
          onAction={cancel}
          onRespond={respond}
        />
      ) : null}
    </AppShell>
  );
}
