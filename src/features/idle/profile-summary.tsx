"use client";
import Link from "next/link";
import { itemRequest } from "../items/item-upload-client";
import { browserResponseSchema, browserWardrobesSchema } from "../items/item-browser-contract";
import { idleClient } from "./idle-client";
import { useIdleResource } from "./use-idle-resource";
import styles from "./idle-dashboard.module.css";

async function loadSummary(signal: AbortSignal) {
  const [inventory, wardrobes, idle] = await Promise.all([
    itemRequest("/api/items?scope=browse&limit=1", "GET", browserResponseSchema, undefined, signal),
    itemRequest("/api/wardrobes", "GET", browserWardrobesSchema, undefined, signal),
    idleClient.read(signal),
  ]);
  return { inventory, wardrobes: wardrobes.wardrobes, idle };
}
const summaryTimeZone = (data: Awaited<ReturnType<typeof loadSummary>>) => data.idle.settings.timeZone;
export function ProfileSummary() {
  const { data, error, loading, reload } = useIdleResource(loadSummary, summaryTimeZone);
  return <section aria-label="衣橱库存" className={styles.profileSummary}>
    {loading && <p role="status">正在读取衣橱库存…</p>}
    {error && <div role="alert" className={styles.error}>{error}<button className={styles.secondary} onClick={reload}>重试</button></div>}
    {data && <><div className={styles.inventoryStats}><Link href="/app/wardrobe"><strong>{data.inventory.summary.itemCount}</strong><span>在用单品</span></Link><Link href="/app/wardrobes"><strong>{data.wardrobes.length}</strong><span>衣柜</span></Link><div><strong>{data.wardrobes.reduce((total, wardrobe) => total + wardrobe.zones.length, 0)}</strong><span>分区</span></div></div><p className={styles.inventoryDetail}>{data.inventory.summary.draftCount} 草稿</p><p className={styles.inventoryDetail}>{data.idle.statistics.idleCount} 闲置 · {data.inventory.summary.watchingCount} 观察中 · {data.idle.statistics.disposedCount} 已处置</p></>}
    <div className={styles.profileLinks}><Link href="/app/wardrobes"><span>衣柜与分区{data && <small>{data.wardrobes.length} 衣柜 · {data.wardrobes.reduce((total, wardrobe) => total + wardrobe.zones.length, 0)} 分区</small>}</span><span aria-hidden="true">›</span></Link><Link href="/app/idle"><span>闲置衣物</span><span aria-hidden="true">›</span></Link><Link href="/app/settings/idle"><span>闲置规则{data && <small>{data.idle.settings.idleDays} 天 / 观察 {data.idle.settings.watchDays} 天</small>}</span><span aria-hidden="true">›</span></Link><Link href="/app/trash"><span>回收站<small>删除的衣物保留 30 天</small></span><span aria-hidden="true">›</span></Link></div>
    <p className={styles.hint}>搭配与灵感还在准备中。</p><div className={styles.honestLinks}><Link href="/app/outfits">查看搭配</Link><Link href="/app/inspiration">查看灵感</Link></div>
  </section>;
}
