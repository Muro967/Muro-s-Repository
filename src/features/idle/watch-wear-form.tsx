"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { itemEditorClient, type EditorItem } from "../items/item-editor-client";
import { ItemClientError } from "../items/item-upload-client";
import { dateOnlySchema } from "../items/item-validation";
import { idleClient } from "./idle-client";
import { useIdleResource } from "./use-idle-resource";
import styles from "./idle-dashboard.module.css";

export function WatchWearForm({ item, onSaved, onReload }: { item: EditorItem; onSaved: (item: EditorItem) => void; onReload: () => void }) {
  // The dashboard supplies the server's calendar date in this user's saved timezone.
  const { data, error: loadError, loading, reload } = useIdleResource(idleClient.read);
  const [date, setDate] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const locked = useRef(false); const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function record(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current || !data || loading || loadError) return;
    setError("");
    if (!dateOnlySchema.safeParse(date).success || !item.watchStartedOn || date < item.watchStartedOn || date > data.today) {
      setError("请填写观察开始当天至今天之间的实际穿着日期。"); return;
    }
    locked.current = true; setPending(true);
    const request = new AbortController(); controller.current = request;
    try {
      // This action must never overwrite metadata loaded before the user wore it.
      const value = await itemEditorClient.save(item.id, { manualLastWornOn: date }, request.signal);
      if (request.signal.aborted) return;
      if (value.id !== item.id || value.deletedAt || value.status !== "active" || value.watchStartedOn !== null || value.watchDueOn !== null || value.manualLastWornOn !== date) {
        throw new Error("服务器未确认观察已结束，请重新加载衣物后核对。");
      }
      onSaved(value);
    } catch (error) {
      if (!request.signal.aborted) setError(error instanceof ItemClientError ? error.message : error instanceof TypeError ? "没有保存，请检查网络后重试。" : error instanceof Error ? error.message : "没有保存，请重试。");
    } finally {
      locked.current = false; if (!request.signal.aborted) setPending(false);
    }
  }

  return <section className={styles.watchWear} aria-label="观察期间的穿着">
    <h2>{item.name}</h2>
    <p>如果在观察期间穿过它，可以手动记录实际日期并结束本次观察。</p>
    <p>观察开始：{item.watchStartedOn ?? "日期未填写"} · 到期：{item.watchDueOn ?? "日期未填写"}</p>
    {loading && <p role="status">正在读取当地日期…</p>}
    {loadError && <div role="alert" className={styles.error}>{loadError}<button type="button" className={styles.secondary} onClick={reload}>重试读取日期</button></div>}
    {data && <form className={styles.form} onSubmit={record} aria-busy={pending}>
      <fieldset className={styles.fields} disabled={pending || loading || !!loadError}><legend className={styles.srOnly}>手动穿着记录</legend>
        <label>手动穿着日期<input type="date" required min={item.watchStartedOn ?? undefined} max={data.today} value={date} onChange={(event) => { setDate(event.target.value); setError(""); }} /></label>
      </fieldset>
      {error && <div className={styles.error} role="alert">{error}<button type="button" className={styles.secondary} disabled={pending} onClick={onReload}>重新加载衣物</button></div>}
      <button className={styles.primary} disabled={!date || !item.watchStartedOn || pending || loading || !!loadError}>{pending ? "正在记录…" : "记录穿着并结束观察"}</button>
      <p className={styles.hint} role="status">{pending ? "正在记录手动穿着日期…" : "仅记录手动填写的日期，不会生成穿着次数。"}</p>
    </form>}
    <Link className={styles.back} href="/app/idle">返回闲置衣物</Link>
  </section>;
}
