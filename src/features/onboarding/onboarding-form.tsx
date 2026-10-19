"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { connectionError, submitOnboarding, type ClientError, type ClientResult } from "@/features/auth/auth-client";
import type { SessionUser } from "@/features/auth/auth-types";
import { FormError, FormField } from "@/features/auth/form-field";
import { hairLengths, hairTextures, type OnboardingInput } from "./onboarding-types";
import styles from "@/features/auth/auth-form.module.css";

export function OnboardingForm({ defaultName, submit = submitOnboarding }: { defaultName: string; submit?: (input: OnboardingInput) => Promise<ClientResult<SessionUser>> }) {
  const router = useRouter();
  const [length, setLength] = useState("");
  const [texture, setTexture] = useState("");
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<ClientError | null>(null);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true; setPending(true); setError(null);
    const data = new FormData(event.currentTarget);
    const input = { name: String(data.get("name") ?? "").trim(), city: String(data.get("city") ?? "").trim(), hairLength: length as OnboardingInput["hairLength"], hairTexture: texture as OnboardingInput["hairTexture"], wardrobeName: String(data.get("wardrobeName") ?? "").trim() };
    try {
      const result = await submit(input);
      if (!result.ok) { setError(result.error); return; }
      router.replace("/app/wardrobe"); router.refresh();
    } catch { setError(connectionError); }
    finally { locked.current = false; setPending(false); }
  }
  return <form className={styles.form} onSubmit={handleSubmit} aria-busy={pending}>
    <FormField label="昵称" name="name" autoComplete="nickname" defaultValue={defaultName} required maxLength={80} error={error?.fields?.name} />
    <FormField label="常用城市" name="city" autoComplete="address-level2" required maxLength={80} placeholder="例如：上海" error={error?.fields?.city} hint="用于今后的天气与穿搭建议" />
    <FormField label="发长" required error={error?.fields?.hairLength}>{(props) => <select {...props} name="hairLength" value={length} onChange={(event) => setLength(event.target.value)}><option value="" disabled>请选择发长</option>{hairLengths.map((value) => <option key={value}>{value}</option>)}</select>}</FormField>
    <FormField label="发质" required error={error?.fields?.hairTexture}>{(props) => <select {...props} name="hairTexture" value={texture} onChange={(event) => setTexture(event.target.value)}><option value="" disabled>请选择发质</option>{hairTextures.map((value) => <option key={value}>{value}</option>)}</select>}</FormField>
    <FormField label="第一个衣柜名称" name="wardrobeName" defaultValue="我的衣柜" required maxLength={80} error={error?.fields?.wardrobeName} />
    <FormError error={error} />
    <button className={styles.button} disabled={pending} type="submit">{pending ? "正在保存…" : "开启我的衣橱"}</button>
  </form>;
}
