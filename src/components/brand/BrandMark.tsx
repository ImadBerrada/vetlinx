import styles from "./BrandMark.module.css";

interface BrandMarkProps {
  inverse?: boolean;
}

export function BrandMark({ inverse = false }: BrandMarkProps) {
  return (
    <span className={`${styles.brand} ${inverse ? styles.inverse : ""}`} aria-label="VetLinX">
      <svg viewBox="0 0 30 38" aria-hidden="true">
        <path d="M7 6 19 18 8 29" />
        <path d="m15 3 10 10-13 13" />
        <path d="m20 23 5 5" />
      </svg>
      <span>VetLin<span className={styles.accent}>X</span></span>
    </span>
  );
}

