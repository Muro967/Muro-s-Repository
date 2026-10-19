"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { connectionError, logout, type ClientError, type ClientResult } from "./auth-client";
import { FormError } from "./form-field";
import styles from "./auth-form.module.css";

export function LogoutButton({ submit = logout }: { submit?: () => Promise<ClientResult<{ ok: true }>> }) {
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ClientError | null>(null);
  async function handleLogout() {
    if (locked.current) return;
    locked.current = true; setPending(true); setError(null);
    try {
      const result = await submit();
      if (!result.ok) { setError(result.error); return; }
      router.replace("/login"); router.refresh();
    } catch { setError(connectionError); }
    finally { locked.current = false; setPending(false); }
  }
  return <div className={styles.form}><FormError error={error} /><button className={styles.button} type="button" disabled={pending} onClick={handleLogout}>{pending ? "正在退出…" : "退出登录"}</button></div>;
}
