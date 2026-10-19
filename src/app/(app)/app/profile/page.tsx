import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandHeader } from "@/components/brand/brand-header";
import { AppShell } from "@/components/navigation/app-shell";
import { getCurrentUser } from "@/features/auth/current-user";
import { LogoutButton } from "@/features/auth/logout-button";
import { readProfileSettings } from "@/features/onboarding/onboarding-service";
import { getDb } from "@/server/db/client";
import styles from "@/components/navigation/tab-page.module.css";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboardingComplete) redirect("/app/onboarding");
  const settings = await readProfileSettings(getDb(), user.id);
  return <AppShell activeTab="profile"><BrandHeader /><h2 className={styles.heading}>{user.name} 的衣橱</h2>
    <dl className={styles.profile}>
      <div className={styles.row}><dt>昵称</dt><dd>{user.name}</dd></div>
      <div className={styles.row}><dt>邮箱</dt><dd>{user.email}</dd></div>
      <div className={styles.row}><dt>常用城市</dt><dd>{settings.city}</dd></div>
      <div className={styles.row}><dt>发型建议依据</dt><dd>{settings.hairLength} · {settings.hairTexture}</dd></div>
      <div className={styles.row}><dt>云端同步</dt><dd className={styles.connected}>已连接</dd></div>
    </dl><Link className={styles.settingsLink} href="/app/wardrobes">衣柜与分区<span aria-hidden="true">›</span></Link><LogoutButton />
  </AppShell>;
}
