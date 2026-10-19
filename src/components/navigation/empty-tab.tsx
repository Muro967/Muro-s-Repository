import { BrandHeader } from "@/components/brand/brand-header";
import { AppIcon } from "@/components/icons/app-icons";
import { AppShell } from "./app-shell";
import type { TabId } from "./bottom-tabs";
import styles from "./tab-page.module.css";

export function EmptyTab({ tab, label, title, description }: { tab: Exclude<TabId, "profile">; label: string; title: string; description: string }) {
  return <AppShell activeTab={tab}><BrandHeader /><h2 className={styles.heading}>{label}</h2><section className={styles.empty} data-tab={tab} aria-label={title}>
    <div className={styles.emblem}><AppIcon name={tab} /></div><h3 className={styles.title}>{title}</h3><p className={styles.description}>{description}</p>
  </section></AppShell>;
}
