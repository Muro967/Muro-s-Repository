import Link from "next/link";
import { AppShell } from "@/components/navigation/app-shell";
import { BrandHeader } from "@/components/brand/brand-header";
import { AppIcon } from "@/components/icons/app-icons";
import styles from "@/components/navigation/tab-page.module.css";
export default function WardrobePage() {
  return <AppShell activeTab="wardrobe"><BrandHeader /><div className={styles.headingRow}><h2 className={styles.heading}>我的衣橱</h2><Link className={styles.managementLink} href="/app/wardrobes">衣柜与分区 <span aria-hidden="true">›</span></Link></div>
    <section className={styles.empty} data-tab="wardrobe" aria-label="衣橱还是空的"><div className={styles.emblem}><AppIcon name="wardrobe" /></div><h3 className={styles.title}>衣橱还是空的</h3><p className={styles.description}>下一阶段会在这里添加衣物</p></section>
  </AppShell>;
}
