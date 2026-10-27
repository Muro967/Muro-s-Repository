"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { recreationClient } from "./recreation-client";
import type { Recreation } from "./recreation-types";
import styles from "./recreation.module.css";

export function RecreationBuilder({
  inspirationId,
  create = recreationClient.create,
}: {
  inspirationId: string;
  create?: (inspirationId: string, signal?: AbortSignal) => Promise<Recreation>;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "building" | "opening">("idle");
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    if (state !== "idle") return;
    setState("building");
    setError(null);
    try {
      const recreation = await create(inspirationId);
      setState("opening");
      router.replace(`/app/inspiration/${inspirationId}/recreate/${recreation.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "暂时无法复刻，请重试。");
      setState("idle");
    }
  };

  return <section className={styles.builder}>
    <p className={styles.eyebrow}>RECREATE FROM YOUR WARDROBE</p>
    <h1>用我的衣服复刻</h1>
    <p>先用你的风格线索、不喜欢规则和现有衣物做一版可解释的匹配。只使用衣橱里“在用”的衣物。</p>
    <div className={styles.ruleNote}><span aria-hidden="true">✦</span><div><strong>本次使用规则预览</strong><small>不会推荐购买，也不会把灵感图里的衣物当作你的库存。</small></div></div>
    {error ? <div role="alert" className={styles.error}>{error}</div> : null}
    {state === "opening" ? <p role="status" className={styles.opening}>正在打开复刻结果…</p> : null}
    <button className={styles.primary} type="button" disabled={state !== "idle"} onClick={() => void build()}>
      {state === "building" ? "正在匹配衣橱…" : error ? "重试复刻" : "开始规则复刻"}
    </button>
  </section>;
}
