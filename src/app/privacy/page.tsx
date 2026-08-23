import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "Privacy | VetLinX" };

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <header><BrandMark /></header>
      <section className={styles.content}>
        <p className={styles.eyebrow}>Trust and privacy</p>
        <h1>Privacy policy</h1>
        <p className={styles.notice}>Pre-launch notice: VetLinX&apos;s complete privacy policy is under legal and regulatory review. It must be approved before public release.</p>
        <p>VetLinX is being designed around explicit consent, auditable access, purpose limitation, and clear separation between identifiable operational records and governed, de-identified intelligence.</p>
        <Link className={styles.back} href="/register">← Return to account creation</Link>
      </section>
    </main>
  );
}
