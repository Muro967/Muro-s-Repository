import styles from "./offline.module.css";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className={styles.page} aria-labelledby="offline-title">
      <div className={styles.mark} aria-hidden="true">
        <span className={styles.door} />
      </div>
      <p className={styles.eyebrow}>AI Wardrobe</p>
      <h1 id="offline-title">现在无法连接网络</h1>
      <p>请检查网络连接后重试。你的衣橱内容需要联网才能安全加载。</p>
      <Link className={styles.retry} href="/">重新连接</Link>
    </main>
  );
}
