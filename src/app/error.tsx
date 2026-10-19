"use client";
import { AccountPage } from "@/features/auth/account-page";
import styles from "@/features/auth/auth-form.module.css";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AccountPage title="暂时无法打开衣橱" description="请检查网络连接，稍后再试。"><button type="button" className={styles.button} onClick={reset}>重新加载</button></AccountPage>;
}
