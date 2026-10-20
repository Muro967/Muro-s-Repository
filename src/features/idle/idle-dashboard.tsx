"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { idleClient, dateDays, disposalChoices, formatMinor, type ClientIdleItem } from "./idle-client";
import { useIdleResource } from "./use-idle-resource";
import { DisposalSheet } from "./disposal-sheet";
import styles from "./idle-dashboard.module.css";

function RateCard({ label, rate, sage = false }: { label: string; rate: number; sage?: boolean }) {
  const percent = Math.round(rate * 100);
  return <div className={styles.rateCard}><svg className={sage ? styles.sageRing : styles.roseRing} viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="19" /><circle cx="24" cy="24" r="19" pathLength="100" strokeDasharray={`${percent} 100`} /></svg><div><strong>{percent}%</strong><span>{label}</span></div></div>;
}
function ItemImage({ item }: { item: ClientIdleItem }) { return <div className={styles.thumbnail}>{item.original ? <Image src={item.original.contentUrl} width={80} height={80} alt="" unoptimized /> : <span>暂无照片</span>}</div>; }

export function IdleDashboard() {
  const { data, error, loading, reload } = useIdleResource(idleClient.read);
  const [segment, setSegment] = useState<"idle" | "watching" | "disposed">("idle"); const [selected, setSelected] = useState<ClientIdleItem | null>(null);
  const [pending, setPending] = useState(""); const [mutationError, setMutationError] = useState(""); const [announcement, setAnnouncement] = useState("");
  const lock = useRef(false); const controller = useRef<AbortController | null>(null); const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function watch(item: ClientIdleItem) {
    if (lock.current || loading || error) return; lock.current = true; setPending(item.id); setMutationError(""); controller.current = new AbortController();
    try { await idleClient.watch(item.id, item.status === "watching", controller.current.signal); if (!controller.current.signal.aborted) { setAnnouncement(item.status === "watching" ? "已取消观察" : "已加入观察，观察到期不会自动处置"); reload(); } }
    catch (error) { if (!controller.current?.signal.aborted) setMutationError(error instanceof Error ? error.message : "操作失败，请重试。"); }
    finally { lock.current = false; if (!controller.current?.signal.aborted) setPending(""); }
  }
  const idle = data?.items.filter((item) => item.isIdle) ?? []; const watching = data?.items.filter((item) => item.status === "watching") ?? [];
  const items = segment === "watching" ? watching : idle;
  const busy = Boolean(pending || loading || error);
  return <div className={styles.dashboard}>
    <Link className={styles.back} href="/app/wardrobe">‹ 衣橱</Link>
    <h1 className={styles.title} ref={heading} tabIndex={-1}>闲置衣物</h1>
    <p className={styles.subtitle}>根据手动填写的最后穿着日期与入库时间计算</p>
    <details className={styles.rules}><summary>闲置规则与计算方式</summary><p>超过 {data?.settings.idleDays ?? "设定的"} 天才计为闲置。新入库衣物享有 30 天宽限期；明确标为非当季的衣物不计入闲置。未填写手动最后穿着日期时，以入库日期计算。观察中的闲置衣物仍计入闲置率。</p><p>闲置率 = 闲置 ÷ 在用单品；处置率 = 已处置 ÷（已处置 + 闲置）。观察到期只提醒，不会自动处置。季节默认按所选时区的月份划分，也可手动指定。</p><Link href="/app/settings/idle">修改闲置规则 ›</Link></details>
    {loading && <p role="status" className={styles.hint}>{data ? "正在更新资料…" : "正在整理闲置衣物…"}</p>}
    {error && <div className={styles.error} role="alert">{error}<button type="button" className={styles.secondary} onClick={reload} disabled={loading}>重试</button></div>}
    {mutationError && <p className={styles.error} role="alert">{mutationError}</p>}
    <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
    {data && <><div className={styles.rates}><RateCard label="闲置率" rate={data.statistics.idleRate} /><RateCard label="处置率" rate={data.statistics.disposalRate} sage /></div>
      <div className={styles.segments} role="group" aria-label="闲置衣物状态">{([{ id: "idle", label: "全部闲置", count: data.statistics.idleCount }, { id: "watching", label: "观察中", count: watching.length }, { id: "disposed", label: "已处置", count: data.statistics.disposedCount }] as const).map(({ id, label, count }) => <button type="button" key={id} aria-pressed={segment === id} onClick={() => setSegment(id)}>{label} {count}</button>)}</div>
      {segment === "disposed" ? <>
        <section className={styles.disposalSummary} aria-label="处置汇总"><div className={styles.summaryHeading}><h2>处置方式</h2><div><span>二手收入</span>{Object.entries(data.statistics.soldIncomeByCurrency).length ? Object.entries(data.statistics.soldIncomeByCurrency).map(([currency, amount]) => <p key={currency}>{formatMinor(amount, currency)}</p>) : <p>暂无已记录收入</p>}</div></div><div className={styles.distribution}>{disposalChoices.map(({ id, label }) => <span key={id}>{label} {data.statistics.methodTotals[id]}</span>)}</div></section>
        <div className={styles.list}>{data.disposals.map((record) => <article className={styles.item} key={record.id}><ItemImage item={record.item} /><div className={styles.itemCopy}><h2><Link href={`/app/items/${record.itemId}`}>{record.item.name}</Link></h2><p>{disposalChoices.find(({ id }) => id === record.method)?.label}{record.currency && record.saleAmountMinor !== null ? ` · ${formatMinor(record.saleAmountMinor, record.currency)}` : ""}</p><p>{[record.platform, record.recipient, record.disposedOn].filter(Boolean).join(" · ")}</p>{record.notes && <p>{record.notes}</p>}</div></article>)}</div>
        {!data.disposals.length && <div className={styles.empty}><h2>还没有处置记录</h2><p>为不再需要的衣物安排下一站，记录会留在这里。</p></div>}
      </> : <><div className={styles.list}>{items.map((item) => {
        const remaining = item.watchDueOn ? dateDays(data.today, item.watchDueOn) : null;
        return <article className={styles.item} key={item.id}><ItemImage item={item} /><div className={styles.itemCopy}><h2><Link href={`/app/items/${item.id}`}>{item.name}</Link></h2><p>{item.manualLastWornOn ? `手动最后穿着 ${item.manualLastWornOn}` : `入库 ${item.addedOn ?? "日期未填写"}`}</p>{item.status === "watching" && <p className={remaining !== null && remaining < 0 ? styles.overdue : styles.watchText}>{remaining === null ? "观察日期未填写" : remaining < 0 ? `观察已逾期 ${-remaining} 天` : remaining === 0 ? "观察今天到期" : `观察剩余 ${remaining} 天`}</p>}{item.status === "watching" && !item.isIdle && <p>当前不计入闲置</p>}</div><div className={styles.actions}><button type="button" disabled={busy} aria-label={`${item.status === "watching" ? "取消观察" : "观察"}${item.name}`} onClick={() => watch(item)}>{pending === item.id ? "保存中" : item.status === "watching" ? "取消观察" : "观察"}</button><button type="button" disabled={busy} aria-label={`处置${item.name}`} onClick={() => setSelected(item)}>处置</button></div></article>;
      })}</div>{!items.length && <div className={styles.empty}><h2>{segment === "watching" ? "还没有观察中的衣物" : "暂时没有闲置衣物"}</h2><p>{segment === "watching" ? "给还想再穿的衣物一点时间。" : "依据手动日期和当季规则，你的衣橱暂时没有闲置。"}</p></div>}</>}
    </>}
    {selected && data && <DisposalSheet key={selected.id} item={selected} today={data.today} fallbackFocusRef={heading} onClose={() => setSelected(null)} submit={async (input) => {
      controller.current = new AbortController(); const signal = controller.current.signal;
      await idleClient.dispose(selected.id, input, signal);
      if (!signal.aborted) { setSelected(null); setSegment("disposed"); setAnnouncement("处置记录已保存"); reload(); }
    }} />}
  </div>;
}
