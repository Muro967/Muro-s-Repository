import type { ReactNode } from "react";
import styles from "./brand-header.module.css";

export function BrandHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}><span>AI</span> <em>Wardrobe</em></h1>
        <p className={styles.tagline}>穿你所有，爱你所穿</p>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
