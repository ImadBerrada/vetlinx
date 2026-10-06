"use client";

import { BadgeCheck, Bell, BellRing, CircleAlert, Info, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { ApiNotification } from "@/lib/server/vetlinx-api";
import styles from "./NotificationCenter.module.css";

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const center = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    function outside(event: PointerEvent) { if (!center.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
  }, [open]);

  useEffect(() => {
    let active = true;
    function load() { void fetch("/api/notifications", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { notifications?: ApiNotification[] };
        if (active && response.ok) {
          setNotifications((body.notifications ?? []).filter((item) => item.status === "UNREAD"));
        }
      })
      .catch(() => null); }
    load();
    window.addEventListener("vetlinx:session-changed", load);
    return () => { active = false; window.removeEventListener("vetlinx:session-changed", load); };
  }, []);

  async function dismiss(notificationId: string) {
    setError("");
    const response = await fetch(`/api/notifications/${notificationId}/read`, { method: "POST" }).catch(() => null);
    if (response?.ok) setNotifications((current) => current.filter((item) => item.id !== notificationId));
    else setError("This update could not be marked as read. Try again.");
  }

  return (
    <section ref={center} className={styles.wrapper} aria-label="Notification center">
      <button ref={trigger} type="button" className={styles.trigger} aria-label={`Notifications, ${notifications.length} unread`} title="Notifications" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(current => !current)}><Bell />{notifications.length ? <span className={styles.badge} aria-hidden="true">{notifications.length > 9 ? "9+" : notifications.length}</span> : null}</button>
      {open ? <section id={panelId} className={styles.center} role="dialog" aria-label="Notifications">
      <header><BellRing /><strong>Notifications</strong><span>{notifications.length}</span><button ref={closeButton} type="button" aria-label="Close notifications" onClick={() => {setOpen(false); trigger.current?.focus();}}><X /></button></header>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {!notifications.length ? <p className={styles.empty}>You have no unread updates.</p> : null}
      {notifications.slice(0, 3).map((item) => {
        const positive = item.kind === "CREDENTIAL_VERIFIED" || item.kind === "ORGANIZATION_VERIFIED";
        const negative = ["CREDENTIAL_REJECTED", "CREDENTIAL_EXPIRED", "CREDENTIAL_REVOKED", "ORGANIZATION_REJECTED"].includes(item.kind);
        const credentialUpdate = item.resourceType === "credential" || item.resourceType === "verification_request";
        const Icon = positive ? BadgeCheck : negative ? CircleAlert : Info;
        return <article key={item.id} className={negative ? styles.negative : positive ? styles.positive : ""}>
          <Icon />
          <div><strong>{item.title}</strong><p>{item.message}</p>{credentialUpdate ? <Link href="/credentials" className={styles.action}>View credentials and history</Link> : null}<time>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div>
          <button onClick={() => dismiss(item.id)} aria-label={`Mark ${item.title} as read`}><X /></button>
        </article>;
      })}
      </section> : null}
    </section>
  );
}
