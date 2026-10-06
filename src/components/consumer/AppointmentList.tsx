"use client";
import { useState, type FormEvent } from "react";
import type { ApiAppointment } from "@/lib/server/vetlinx-api";
import styles from "./Consumer.module.css";

export interface AppointmentProposalInput {
  startsAt: string;
  timeZone: string;
  expiresAt: string;
  proposalVersion: number;
  reason: string;
}
type Actions = {
  pending: boolean;
  onAction: (
    appointment: ApiAppointment,
    status: ApiAppointment["status"],
    reason?: string,
  ) => Promise<void>;
  onPropose?: (
    appointment: ApiAppointment,
    proposal: AppointmentProposalInput,
  ) => Promise<boolean>;
  onRespond?: (appointment: ApiAppointment, accept: boolean) => Promise<void>;
};
export function formatAppointment(value: {
  startsAt: string;
  timeZone: string;
}) {
  return `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: value.timeZone }).format(new Date(value.startsAt))} (${value.timeZone})`;
}
function localInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
const labels: Record<ApiAppointment["status"], string> = {
  REQUESTED: "requested",
  CONFIRMED: "confirmed",
  DECLINED: "declined",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
};

export function AppointmentList({
  appointments,
  clinic = false,
  ...actions
}: { appointments: ApiAppointment[]; clinic?: boolean } & Actions) {
  const [filter, setFilter] = useState<"active" | "history" | "all">("active");
  const active = appointments.filter((item) =>
    ["REQUESTED", "CONFIRMED"].includes(item.status),
  );
  const visible =
    filter === "all"
      ? appointments
      : appointments.filter((item) =>
          filter === "active" ? active.includes(item) : !active.includes(item),
        );
  return (
    <>
      <div
        className={styles.actions}
        role="group"
        aria-label="Appointment filters"
      >
        {(["active", "history", "all"] as const).map((value) => (
          <button
            key={value}
            className={filter === value ? styles.primary : styles.secondary}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "active"
              ? `Active (${active.length})`
              : value === "history"
                ? `History (${appointments.length - active.length})`
                : `All (${appointments.length})`}
          </button>
        ))}
      </div>
      {!visible.length ? (
        <div className={styles.empty}>
          <h3>
            {filter === "history"
              ? "No past appointments"
              : "No active appointment requests"}
          </h3>
          <p>
            {filter === "history"
              ? "Completed, declined, and cancelled appointments remain here."
              : clinic
                ? "Owner requests appear here after you enable appointment requests."
                : "Find a clinic and request a time that works for you."}
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              clinic={clinic}
              {...actions}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AppointmentCard({
  appointment,
  clinic,
  ...actions
}: { appointment: ApiAppointment; clinic: boolean } & Actions) {
  const [cancelling, setCancelling] = useState(false);
  const hasProposal = Boolean(
    appointment.proposedStartsAt &&
    appointment.proposedTimeZone &&
    appointment.proposalExpiresAt,
  );
  const expired =
    hasProposal &&
    (new Date(appointment.proposalExpiresAt!) <= new Date() ||
      new Date(appointment.proposedStartsAt!) <= new Date());
  return (
    <article className={styles.appointment}>
      <header>
        <h3>
          {appointment.petName} ·{" "}
          {clinic ? appointment.ownerName : appointment.clinicName}
        </h3>
        <span
          className={`${styles.status} ${appointment.status === "REQUESTED" ? styles.requested : ""}`}
        >
          {labels[appointment.status]}
        </span>
      </header>
      <p>
        <strong>
          {appointment.status === "REQUESTED"
            ? "Requested time"
            : "Appointment time"}
          :
        </strong>{" "}
        {formatAppointment(appointment)}
      </p>
      <p>{appointment.visitReason}</p>
      {clinic ? (
        <p>
          Shared contact: {appointment.contactPhone} ·{" "}
          {appointment.speciesCode.toLowerCase()}
        </p>
      ) : null}
      {appointment.responseNote ? (
        <p>
          <strong>Latest update:</strong> {appointment.responseNote}
        </p>
      ) : null}
      {appointment.status === "REQUESTED" ? (
        <p className={styles.muted}>
          This request is waiting for clinic confirmation. No availability slot
          has been reserved.
        </p>
      ) : null}
      {hasProposal ? (
        <section
          className={styles.notice}
          aria-label={`Proposed time for ${appointment.petName}`}
        >
          <h4>
            {expired
              ? "Proposed time expired"
              : "Clinic proposed a different time"}
          </h4>
          <p>
            {formatAppointment({
              startsAt: appointment.proposedStartsAt!,
              timeZone: appointment.proposedTimeZone!,
            })}
          </p>
          <p>{appointment.proposalReason}</p>
          <p>
            Respond by{" "}
            {formatAppointment({
              startsAt: appointment.proposalExpiresAt!,
              timeZone: appointment.proposedTimeZone!,
            })}
            .{" "}
            {appointment.status === "CONFIRMED"
              ? "Your confirmed time stays in place until you accept."
              : "The original request stays unchanged until you accept."}
          </p>
          {!clinic && actions.onRespond ? (
            <div className={styles.actions}>
              {!expired ? (
                <button
                  className={styles.primary}
                  disabled={actions.pending}
                  onClick={() => void actions.onRespond!(appointment, true)}
                >
                  Accept proposed time
                </button>
              ) : null}
              <button
                className={styles.secondary}
                disabled={actions.pending}
                onClick={() => void actions.onRespond!(appointment, false)}
              >
                {expired ? "Dismiss expired proposal" : "Keep original time"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {clinic ? (
        <ClinicActions appointment={appointment} {...actions} />
      ) : ["REQUESTED", "CONFIRMED"].includes(appointment.status) ? (
        <div className={styles.actions}>
          {cancelling ? (
            <>
              <p>
                Cancel {appointment.petName}&apos;s{" "}
                {appointment.status === "CONFIRMED"
                  ? "confirmed appointment"
                  : "request"}
                ? Any proposed time will also close.
              </p>
              <button
                className={styles.danger}
                disabled={actions.pending}
                onClick={() =>
                  void actions
                    .onAction(appointment, "CANCELLED")
                    .then(() => setCancelling(false))
                }
              >
                Confirm cancellation
              </button>
              <button
                className={styles.secondary}
                disabled={actions.pending}
                onClick={() => setCancelling(false)}
              >
                Keep appointment
              </button>
            </>
          ) : (
            <button
              className={styles.secondary}
              disabled={actions.pending}
              onClick={() => setCancelling(true)}
            >
              Cancel request for {appointment.petName}
            </button>
          )}
        </div>
      ) : null}
      <details className={styles.requestForm}>
        <summary>Appointment history</summary>
        <ol>
          {appointment.history.map((item, index) => (
            <li key={`${item.createdAt}-${index}`}>
              <p>
                <strong>
                  {item.action === "PROPOSED"
                    ? "Clinic proposed a time"
                    : item.action === "PROPOSAL_ACCEPTED"
                      ? "Owner accepted proposed time"
                      : item.action === "PROPOSAL_REJECTED"
                        ? "Owner kept original time"
                        : item.action === "PROPOSAL_EXPIRED"
                          ? "Expired proposal closed"
                          : `Status: ${item.toStatus.toLowerCase()}`}
                </strong>{" "}
                · {new Date(item.createdAt).toLocaleString()}
                {item.proposedStartsAt && item.proposedTimeZone
                  ? ` · ${formatAppointment({ startsAt: item.proposedStartsAt, timeZone: item.proposedTimeZone })}`
                  : ""}
              </p>
              {item.reason ? <p>{item.reason}</p> : null}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

function ClinicActions({
  appointment,
  pending,
  onAction,
  onPropose,
}: { appointment: ApiAppointment } & Actions) {
  const [reason, setReason] = useState("");
  const [proposing, setProposing] = useState(false);
  const [proposalOpenedAt, setProposalOpenedAt] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  if (!["REQUESTED", "CONFIRMED"].includes(appointment.status)) return null;
  const future = new Date(appointment.startsAt) > new Date();
  const liveProposal =
    appointment.proposalExpiresAt &&
    new Date(appointment.proposalExpiresAt) > new Date();
  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await onPropose!(appointment, {
      startsAt: new Date(String(data.get("startsAt"))).toISOString(),
      expiresAt: new Date(String(data.get("expiresAt"))).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      reason: String(data.get("reason")),
      proposalVersion: appointment.proposalVersion,
    });
    if (saved) setProposing(false);
  }
  return (
    <div className={styles.requestForm}>
      <label className={styles.form}>
        Message to pet owner
        <input
          aria-label={`Message for ${appointment.petName}`}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required when declining or cancelling"
        />
      </label>
      <div className={styles.actions}>
        {appointment.status === "REQUESTED" ? (
          <>
            <button
              className={styles.primary}
              disabled={pending || !future || Boolean(liveProposal)}
              onClick={() => void onAction(appointment, "CONFIRMED", reason)}
            >
              Confirm time
            </button>
            <button
              className={styles.secondary}
              disabled={pending || !reason.trim()}
              onClick={() => void onAction(appointment, "DECLINED", reason)}
            >
              Decline request
            </button>
          </>
        ) : (
          <>
            <button
              className={styles.primary}
              disabled={pending || future || Boolean(liveProposal)}
              onClick={() => void onAction(appointment, "COMPLETED", reason)}
            >
              Mark completed
            </button>
            <button
              className={styles.secondary}
              disabled={pending || !reason.trim()}
              onClick={() => setCancelling(true)}
            >
              Cancel appointment
            </button>
          </>
        )}
        {onPropose && (appointment.status === "REQUESTED" || future) ? (
          <button
            className={styles.secondary}
            disabled={pending}
            onClick={() => {
              setProposalOpenedAt(Date.now());
              setProposing(!proposing);
            }}
          >
            Propose a different time
          </button>
        ) : null}
      </div>
      {cancelling ? (
        <div className={styles.notice}>
          <p>Cancel this confirmed appointment and notify the owner?</p>
          <div className={styles.actions}>
            <button
              className={styles.danger}
              disabled={pending || !reason.trim()}
              onClick={() =>
                void onAction(appointment, "CANCELLED", reason).then(() =>
                  setCancelling(false),
                )
              }
            >
              Confirm cancellation
            </button>
            <button
              className={styles.secondary}
              disabled={pending}
              onClick={() => setCancelling(false)}
            >
              Keep appointment
            </button>
          </div>
        </div>
      ) : null}
      {proposing ? (
        <form
          className={`${styles.form} ${styles.requestForm}`}
          onSubmit={(event) => void submitProposal(event)}
        >
          <h4>Propose a time for owner approval</h4>
          <p>
            Dates use your device time zone:{" "}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}. The original
            appointment stays unchanged until acceptance. Sending another
            proposal replaces the pending proposal.
          </p>
          <label>
            Proposed date and time
            <input
              name="startsAt"
              type="datetime-local"
              required
              min={localInput(new Date(proposalOpenedAt + 60_000))}
              defaultValue={localInput(
                new Date(
                  Math.max(
                    new Date(appointment.startsAt).getTime() + 86400000,
                    proposalOpenedAt + 172800000,
                  ),
                ),
              )}
            />
          </label>
          <label>
            Response deadline
            <input
              name="expiresAt"
              type="datetime-local"
              required
              min={localInput(new Date(proposalOpenedAt + 60_000))}
              defaultValue={localInput(new Date(proposalOpenedAt + 86400000))}
            />
          </label>
          <label>
            Reason for proposed time
            <textarea name="reason" required minLength={3} maxLength={1000} />
          </label>
          <div className={styles.actions}>
            <button className={styles.primary} disabled={pending}>
              Send time proposal
            </button>
            <button
              className={styles.secondary}
              type="button"
              disabled={pending}
              onClick={() => setProposing(false)}
            >
              Keep current time
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
