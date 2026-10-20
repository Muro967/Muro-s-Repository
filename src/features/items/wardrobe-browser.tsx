"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandHeader } from "@/components/brand/brand-header";
import { CategoryFolders } from "./category-folders";
import { ItemGrid } from "./item-grid";
import { browserWardrobesSchema, type BrowserWardrobe } from "./item-browser-contract";
import { accessorySubcategories, itemCategories, itemStyles } from "./item-catalog";
import { useItemList } from "./use-item-list";
import styles from "./wardrobe-browser.module.css";

export function WardrobeBrowser() {
 const [wardrobes, setWardrobes] = useState<BrowserWardrobe[]>([]); const [locationError, setLocationError] = useState("");
 const [wardrobeId, setWardrobe] = useState(""); const [zoneId, setZone] = useState("");
 const [mode, setMode] = useState<"categories" | "styles">("categories"); const [categoryId, setCategory] = useState(""); const [styleId, setStyle] = useState(""); const [accessoryId, setAccessory] = useState("");
 const [scope, setScope] = useState("browse"); const [idle, setIdle] = useState(false); const [cursor, setCursor] = useState(""); const [revision, setRevision] = useState(0);
 const params = new URLSearchParams({ scope });
 for (const [key, value] of Object.entries({ wardrobeId, zoneId, categoryId, styleId, accessoryId, cursor, idle: idle ? "true" : "" })) if (value) params.set(key, value);
 const query = params.toString(); const { data, error, loading } = useItemList(query, 0, revision);
 useEffect(() => {
  const controller = new AbortController();
  fetch("/api/wardrobes", { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error(); const data = browserWardrobesSchema.parse(await r.json()); if (!controller.signal.aborted) { setWardrobes(data.wardrobes); setLocationError(""); } }).catch(() => { if (!controller.signal.aborted) setLocationError("衣柜加载失败，请刷新重试。"); });
  return () => controller.abort();
 }, [revision]);
 const change = (action: () => void) => { setCursor(""); action(); };
 const selected = mode === "categories" ? categoryId : styleId;
 const title = scope === "drafts" ? "草稿" : idle ? "闲置衣物" : (mode === "categories" ? itemCategories : itemStyles).find((x) => x.id === selected)?.label ?? "全部单品";
 return <div className={styles.browser}>
  <BrandHeader actions={<><Link href="/app/idle" className={styles.iconButton} aria-label="查看闲置衣物"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M3 3h18v5H3zM10 12h4"/></svg><span className={styles.counter}>{data?.summary.idleCount ?? "–"}</span></Link><Link href="/app/search" className={styles.iconButton} aria-label="搜索衣物"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg></Link></>} />
  <div className={styles.locationRow}><label className={styles.srOnly} htmlFor="browse-wardrobe">选择衣柜</label><select id="browse-wardrobe" value={wardrobeId} onChange={(e) => change(() => { setWardrobe(e.target.value); setZone(""); })}><option value="">全部衣柜</option>{wardrobes.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select><Link href="/app/wardrobes">衣柜与分区 ›</Link></div>
  {wardrobeId && <label className={styles.zone}>分区<select value={zoneId} onChange={(e) => change(() => setZone(e.target.value))}><option value="">全部分区</option>{wardrobes.find((w) => w.id === wardrobeId)?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>}
  <div className={styles.stats}><button aria-pressed={scope === "browse" && !idle} onClick={() => change(() => { setScope("browse"); setIdle(false); })}><strong>{data?.summary.itemCount ?? "–"}</strong><span>件单品</span></button><button aria-label={`草稿 ${data?.summary.draftCount ?? "–"}`} aria-pressed={scope === "drafts"} onClick={() => change(() => { setScope("drafts"); setIdle(false); setCategory(""); setAccessory(""); setStyle(""); })}><strong>{data?.summary.draftCount ?? "–"}</strong><span>草稿</span></button><div><strong>{data?.summary.watchingCount ?? "–"}</strong><span>观察中</span></div></div>
  <CategoryFolders data={data} mode={mode} selected={selected} onMode={(value) => change(() => { setMode(value); setCategory(""); setStyle(""); setAccessory(""); })} onSelect={(value) => change(() => { if (mode === "categories") { setCategory(value); setAccessory(""); } else setStyle(value); })} />
  {categoryId === "accessories" && <div className={styles.chips} aria-label="配饰子类">{[{ id: "", label: "全部" }, ...accessorySubcategories].map((c) => <button key={c.id} aria-pressed={accessoryId === c.id} onClick={() => change(() => setAccessory(c.id))}>{c.label}</button>)}</div>}
  <div className={styles.heading}><h2>{title}</h2><small>按最近穿着排序</small></div>
  {(error || locationError) && <p role="alert">{error || locationError}<button onClick={() => setRevision((n) => n + 1)}>重试</button></p>}
  {loading && <p role="status">正在打开衣橱…</p>}
  {data && <><p className={styles.resultCount}>共 {data.total} 件</p>{data.items.length ? <ItemGrid key={`${query}:${revision}`} items={data.items} onChanged={() => setRevision((n) => n + 1)} /> : <div className={styles.empty}><h3>这里还没有衣物</h3><p>{scope === "drafts" ? "录入未完成的衣物会保存在这里。" : "添加衣物，或试试其他筛选。"}</p></div>}{data.nextCursor && <button className={styles.pageButton} onClick={() => setCursor(data.nextCursor!)}>下一页</button>}{cursor && <button className={styles.pageButton} onClick={() => setCursor("")}>返回第一页</button>}</>}
  <Link className={styles.trashLink} href="/app/trash">回收站 ›</Link><Link className={styles.fab} href="/app/items/new" aria-label="添加衣物">＋</Link>
 </div>;
}
