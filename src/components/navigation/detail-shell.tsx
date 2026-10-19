import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./detail-shell.module.css";

export function DetailShell({ children, backHref = "/app/wardrobe", backLabel = "衣橱" }: { children: ReactNode; backHref?: string; backLabel?: string }) {
  return <div className={styles.shell}><main className={styles.content}>
    <Link className={styles.back} href={backHref} aria-label={`返回${backLabel}`}><span aria-hidden="true">‹</span>{backLabel}</Link>
    {children}
  </main></div>;
}
