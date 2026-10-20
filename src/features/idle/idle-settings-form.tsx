"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { seasons } from "../items/item-catalog";
import { idleClient, type ClientIdleSettings } from "./idle-client";
import { useIdleResource } from "./use-idle-resource";
import styles from "./idle-dashboard.module.css";

function SettingsFields({ initial }: { initial: ClientIdleSettings }) {
  const [idleDays, setIdleDays] = useState(String(initial.idleDays)); const [watchDays, setWatchDays] = useState(String(initial.watchDays));
  const [timeZone, setTimeZone] = useState(initial.timeZone); const [season, setSeason] = useState(initial.seasonOverride ?? "");
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const locked = useRef(false); const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (locked.current) return; setError(""); setMessage("");
    try { if (/^[+-]/.test(timeZone)) throw new Error(); new Intl.DateTimeFormat("zh-CN", { timeZone }).format(); }
    catch { setError("请填写有效的 IANA 时区，例如 Asia/Shanghai。"); return; }
    locked.current = true; setPending(true); controller.current = new AbortController();
    try { await idleClient.saveSettings({ idleDays: Number(idleDays), watchDays: Number(watchDays), timeZone, seasonOverride: (season || null) as ClientIdleSettings["seasonOverride"] }, controller.current.signal); if (!controller.current.signal.aborted) setMessage("闲置规则已保存"); }
    catch (error) { if (!controller.current?.signal.aborted) setError(error instanceof Error ? error.message : "保存失败，请重试。"); }
    finally { locked.current = false; if (!controller.current?.signal.aborted) setPending(false); }
  }
  return <form className={styles.settingsForm} onSubmit={save} aria-busy={pending}><fieldset className={styles.fields} disabled={pending}><legend className={styles.srOnly}>闲置与观察规则</legend>
    <label>闲置天数<input aria-label="闲置天数" aria-describedby="idle-days-help" type="number" min={1} max={3650} step={1} required value={idleDays} onChange={(e) => { setIdleDays(e.target.value); setMessage(""); }} /><small id="idle-days-help">超过这个天数才计为闲置，恰好达到时不计入。</small></label>
    <label>观察天数<input aria-label="观察天数" aria-describedby="watch-days-help" type="number" min={1} max={365} step={1} required value={watchDays} onChange={(e) => { setWatchDays(e.target.value); setMessage(""); }} /><small id="watch-days-help">用于新加入观察的衣物；已有观察日期保持不变。</small></label>
    <label>时区<input aria-label="时区" aria-describedby="timezone-help" value={timeZone} required maxLength={100} onChange={(e) => { setTimeZone(e.target.value); setMessage(""); }} placeholder="Asia/Shanghai" /><small id="timezone-help">日期与自动季节依据此时区计算。</small></label>
    <label>当前季节<select aria-label="当前季节" aria-describedby="season-help" value={season} onChange={(e) => { setSeason(e.target.value as typeof season); setMessage(""); }}><option value="">根据月份自动判断</option>{seasons.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select><small id="season-help">自动季节使用北半球气象季节；可按所在地手动指定。</small></label>
  </fieldset>{error && <p role="alert" className={styles.error}>{error}</p>}<button className={styles.primary} disabled={pending}>{pending ? "正在保存…" : "保存规则"}</button><p role="status" className={styles.watchText}>{pending ? "正在保存规则…" : message}</p></form>;
}
export function IdleSettingsForm() {
  const { data, error, loading, reload } = useIdleResource(idleClient.readSettings);
  return <div className={styles.dashboard}><Link className={styles.back} href="/app/profile">‹ 我的</Link><h1 className={styles.title}>闲置规则</h1><p className={styles.subtitle}>给衣物一点时间，也给衣橱留一点空间。</p><div className={styles.ruleCard}><p>根据手动填写的最后穿着日期与入库时间计算</p><p>新入库衣物享有 30 天宽限期。明确标为非当季的衣物不计入闲置；没有季节标签时不会排除。观察到期只提示，不会自动处置。</p></div>{loading && <p role="status">正在读取规则…</p>}{error && <div role="alert" className={styles.error}>{error}<button className={styles.secondary} onClick={reload}>重试</button></div>}{data && <SettingsFields initial={data} />}</div>;
}
