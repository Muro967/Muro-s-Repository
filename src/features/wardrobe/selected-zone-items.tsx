"use client";

import { useState } from "react";
import { ItemCard } from "@/features/items/item-card";
import { useItemList } from "@/features/items/use-item-list";
import styles from "./wardrobe-manager.module.css";

// The manager uses the same available-garment scope as the main wardrobe:
// active + watching, excluding drafts, disposed items and soft-deleted items.
export function SelectedZoneItems({ wardrobeId, zoneId }: { wardrobeId: string; zoneId: string }) {
  const [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState("");
  const params = new URLSearchParams({ scope: "browse", wardrobeId, zoneId });
  if (cursor) params.set("cursor", cursor);
  const { data, loading, error } = useItemList(params.toString(), 0, revision);

  return <>
    {loading && <p role="status">正在加载分区衣物…</p>}
    {error && <div role="alert" className={styles.error}><p>{error}</p><button type="button" className={styles.secondary} onClick={() => setRevision((current) => current + 1)}>重试加载衣物</button></div>}
    {data && <>
      <p className={styles.hint}>共 {data.total} 件</p>
      {data.items.length ? <div className={styles.itemGrid}>{data.items.map((item, index) => <ItemCard key={item.id} item={item} eager={index < 3} />)}</div> : <div className={styles.empty}><h3>{data.total === 0 ? "这个分区还没有在用衣物" : "这一页没有衣物"}</h3><p>{data.total === 0 ? "添加衣物并保存到衣橱，或把其他分区的衣物移到这里。草稿请在衣橱的草稿入口继续录入。" : "衣物位置可能已更新，请返回第一页查看。"}</p></div>}
      {data.nextCursor && <button type="button" className={styles.secondary} onClick={() => setCursor(data.nextCursor!)}>下一页衣物</button>}
    </>}
    {cursor && <button type="button" className={styles.secondary} onClick={() => setCursor("")}>返回第一页衣物</button>}
  </>;
}
