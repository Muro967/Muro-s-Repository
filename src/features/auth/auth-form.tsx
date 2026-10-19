"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { connectionError, submitAuth, type ClientError, type ClientResult } from "./auth-client";
import type { LoginInput, RegisterInput, SessionUser } from "./auth-types";
import { FormError, FormField } from "./form-field";
import styles from "./auth-form.module.css";

export function AuthForm({ mode, submit }: { mode: "register" | "login"; submit?: (input: RegisterInput | LoginInput) => Promise<ClientResult<SessionUser>> }) {
  const router = useRouter();
  const [error, setError] = useState<ClientError | null>(null);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const registering = mode === "register";
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setPending(true); setError(null);
    const data = new FormData(event.currentTarget);
    const credentials = { email: String(data.get("email") ?? "").trim(), password: String(data.get("password") ?? "") };
    const passwordLength = [...credentials.password].length;
    if (passwordLength > 128 || (registering && passwordLength < 10)) {
      setError({ code: "INVALID_INPUT", message: "请检查密码长度后重试。", fields: { password: registering ? "请使用 10–128 个字符的密码" : "密码最多为 128 个字符" } });
      locked.current = false;
      setPending(false);
      return;
    }
    const input = registering ? { ...credentials, inviteCode: String(data.get("inviteCode") ?? "").trim(), name: String(data.get("name") ?? "").trim() } : credentials;
    try {
      const result = await (submit ? submit(input) : submitAuth(mode, input));
      if (!result.ok) { setError(result.error); return; }
      router.replace(registering || !result.value.onboardingComplete ? "/app/onboarding" : "/app/wardrobe");
      router.refresh();
    } catch { setError(connectionError); }
    finally { locked.current = false; setPending(false); }
  }
  return <>
    <form className={styles.form} method="post" action={`/api/auth/${mode}`} onSubmit={handleSubmit} aria-busy={pending}>
      {registering ? <FormField label="邀请码" name="inviteCode" autoComplete="off" autoCapitalize="none" required maxLength={256} error={error?.fields?.inviteCode} /> : null}
      <FormField label="邮箱" name="email" type="email" autoComplete="email" autoCapitalize="none" required maxLength={320} error={error?.fields?.email} />
      <FormField label="密码" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} required hint={registering ? "使用 10–128 个字符，建议混合字母、数字和符号" : undefined} error={error?.fields?.password} />
      {registering ? <FormField label="昵称" name="name" autoComplete="nickname" required maxLength={80} error={error?.fields?.name} /> : null}
      <FormError error={error} />
      <button className={styles.button} type="submit" disabled={pending}>{pending ? registering ? "正在创建账号…" : "正在登录…" : registering ? "创建账号" : "登录"}</button>
    </form>
    <p className={styles.footer}>{registering ? "已经有账号？" : "收到邀请码了？"}<Link href={registering ? "/login" : "/register"}>{registering ? "去登录" : "创建账号"}</Link></p>
  </>;
}
