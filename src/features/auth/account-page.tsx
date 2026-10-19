import type { ReactNode } from "react";
import { BrandHeader } from "@/components/brand/brand-header";
import styles from "./auth-form.module.css";

export function AccountPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className={styles.page}><BrandHeader /><section className={styles.card} aria-label={title}>
    <h2 className={styles.title}>{title}</h2><p className={styles.intro}>{description}</p>{children}
  </section></main>;
}
