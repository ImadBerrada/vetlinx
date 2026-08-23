import { BadgeCheck, IdCard, UserRound } from "lucide-react";
import styles from "./Auth.module.css";

const stages = [
  { icon: UserRound, title: "Identity", detail: "Your professional identity is verified and secure." },
  { icon: IdCard, title: "Professional profile", detail: "Your experience and expertise are documented." },
  { icon: BadgeCheck, title: "Credentials", detail: "Your qualifications are verified by trusted sources." },
] as const;

export function EvidenceRail({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <ol className={styles.mobileEvidence} aria-label="Your VetLinX professional record">
        {stages.map(({ icon: Icon, title }, index) => (
          <li key={title}>
            <span className={styles.mobileEvidenceIcon}><Icon aria-hidden="true" /></span>
            <span className={styles.mobileStageNumber}>0{index + 1}</span>
            <span>{title === "Professional profile" ? "Profile" : title}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className={styles.evidenceCanvas}>
      <div className={styles.evidenceRail}>
        {stages.map(({ icon: Icon, title, detail }) => (
          <div className={styles.evidenceStage} key={title}>
            <span className={styles.evidenceIcon}><Icon aria-hidden="true" /></span>
            <div>
              <h2>{title}</h2>
              <p>{detail}</p>
            </div>
          </div>
        ))}
      </div>

      <article className={styles.identityCard} aria-label="VetLinX professional identity preview">
        <div className={styles.cardBrand}>VetLinX</div>
        <div className={styles.avatarLineArt}><UserRound aria-hidden="true" /></div>
        <h2>Your professional identity</h2>
        <p>Qualifications connected</p>
        <p>Evidence under your control</p>
        <div className={styles.verifiedBand}>
          <BadgeCheck aria-hidden="true" />
          <span><strong>Built for verified records</strong>Connected. Verified. Trusted.</span>
        </div>
      </article>
    </div>
  );
}
