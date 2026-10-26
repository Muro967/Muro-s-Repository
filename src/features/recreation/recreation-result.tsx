"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { recreationClient } from "./recreation-client";
import type { Recreation } from "./recreation-types";
import styles from "./recreation.module.css";

export function RecreationResult({
  recreationId,
  load = recreationClient.read,
}: {
  recreationId: string;
  load?: (recreationId: string, signal?: AbortSignal) => Promise<Recreation>;
}) {
  const [value, setValue] = useState<Recreation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await load(recreationId, signal);
      if (!signal?.aborted) setValue(result);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "暂时无法读取复刻结果。");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [load, recreationId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => read(controller.signal));
    return () => controller.abort();
  }, [read]);

  if (loading) return <p role="status" className={styles.loading}>正在打开复刻结果…</p>;
  if (error || !value) return <div role="alert" className={styles.error}>{error ?? "暂时无法读取复刻结果。"}<button onClick={() => void read()}>重新加载</button></div>;

  return <section className={styles.result}>
    <header><div><p className={styles.eyebrow}>WARDROBE RECREATION</p><h1>用我的衣服复刻</h1></div><span>{value.mode === "rules" ? "规则预览" : "AI 建议"}</span></header>

    <div className={styles.look} aria-label="复刻穿搭">
      {value.items.map((item) => <Link href={`/app/items/${item.itemId}`} className={styles.lookItem} key={item.itemId}>
        <div className={styles.itemImage}>{item.imageUrl ? <Image src={item.imageUrl} alt={item.name} fill sizes="150px" unoptimized /> : <span aria-hidden="true">◇</span>}</div>
        <div><small>{item.slot}</small><strong>{item.name}</strong><span>{item.colorNames.join(" · ") || "颜色未填写"}</span></div>
      </Link>)}
      {value.items.length === 0 ? <p className={styles.empty}>衣橱资料还不足以组成一套穿搭。</p> : null}
    </div>

    {value.similarities.length > 0 ? <section className={styles.explanation}><p className={styles.eyebrow}>WHY IT WORKS</p><h2>相似点</h2><ul>{value.similarities.map((text) => <li key={text}>{text}</li>)}</ul></section> : null}
    {value.missing.length > 0 ? <section className={styles.gaps}><p className={styles.eyebrow}>HONEST GAPS</p><h2>还缺一点</h2>{value.missing.map((slot) => <p key={slot}>衣柜中暂时没有接近的{slot}</p>)}</section> : null}
    <Link className={styles.primaryLink} href="/app/wardrobe">返回衣柜补充资料</Link>
  </section>;
}
