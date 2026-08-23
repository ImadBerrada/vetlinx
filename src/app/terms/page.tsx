import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "Terms | VetLinX" };

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <header><BrandMark /></header>
      <section className={styles.content}>
        <p className={styles.eyebrow}>Platform terms</p>
        <h1>Terms of service</h1>
        <p className={styles.notice}>Pre-launch notice: VetLinX&apos;s complete terms are under legal and regulatory review. They must be approved before public release.</p>
        <p>The production terms will define professional responsibilities, verification standards, permitted platform use, clinical boundaries, dispute handling, and country-specific requirements.</p>
        <Link className={styles.back} href="/register">← Return to account creation</Link>
      </section>
    </main>
  );
}
