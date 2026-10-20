"use client";
import { useRef, useState } from "react";
import { ItemCard } from "./item-card";
import { restoreWindow } from "./item-lifecycle";
import { useItemList } from "./use-item-list";
import styles from "./wardrobe-browser.module.css";

export function TrashBrowser() {
 const [revision, setRevision] = useState(0); const [cursor, setCursor] = useState(""); const [pending, setPending] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
 const operation = useRef(false);
 const { data, loading, error: loadError } = useItemList(`scope=trash${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, 0, revision);
 async function restore(id: string) {
  if (operation.current) return;
  operation.current = true; setPending(id); setError(""); setNotice("");
  try {
   const r = await fetch(`/api/items/${id}/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
   if (!r.ok) { const body = await r.json(); throw new Error(body.error?.code === "RESTORE_EXPIRED" ? "恢复期限已过，衣物保留在回收站。" : "恢复未完成，请重试。"); }
   setNotice("衣物已恢复"); setRevision((n) => n + 1);
  } catch (e) { setError(e instanceof Error ? e.message : "恢复未完成，请重试。"); }
  finally { operation.current = false; setPending(""); }
 }
 return <section className={styles.browser}><h1 className={styles.title}>回收站</h1><p className={styles.description}>移入后 30 天内可恢复。到期后暂不支持恢复，照片会保留。</p>
  {(loadError || error) && <p role="alert">{error || loadError}</p>}{notice && <p role="status">{notice}</p>}{loading && <p role="status">正在打开回收站…</p>}
  {data && <><p className={styles.resultCount}>共 {data.total} 件</p><div className={styles.grid}>{data.items.map((item, index) => {
   const window = item.deletedAt ? restoreWindow(item.deletedOn ?? item.deletedAt, data.today) : { remainingDays: 0, canRestore: false };
   return <div key={item.id} className={styles.trashItem}><ItemCard item={item} eager={index < 3} /><p>{window.canRestore ? `剩余 ${window.remainingDays} 天` : "恢复期限已过"}</p><button disabled={!window.canRestore || Boolean(pending)} onClick={() => void restore(item.id)} aria-label={`恢复${item.name}`}>{pending === item.id ? "恢复中…" : "恢复"}</button></div>;
  })}</div>{!data.items.length && <div className={styles.empty}><h2>回收站是空的</h2><p>移入回收站的衣物会显示在这里。</p></div>}{data.nextCursor && <button className={styles.pageButton} disabled={Boolean(pending)} onClick={() => setCursor(data.nextCursor!)}>下一页</button>}{cursor && <button className={styles.pageButton} onClick={() => setCursor("")}>返回第一页</button>}</>}
 </section>;
}
