"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/overlays/bottom-sheet";
import { ItemCard } from "./item-card";
import { browserWardrobesSchema, type BrowserItem, type BrowserWardrobe } from "./item-browser-contract";
import styles from "./wardrobe-browser.module.css";

export function ItemGrid({ items, onChanged }: { items: BrowserItem[]; onChanged: () => void }) {
 const [selected, setSelected] = useState<BrowserItem | null>(null);
 const [moving, setMoving] = useState(false);
 const [wardrobes, setWardrobes] = useState<BrowserWardrobe[]>([]);
 const [locationsReady, setLocationsReady] = useState(false);
 const [wardrobeId, setWardrobe] = useState(""); const [zoneId, setZone] = useState("");
 const [busy, setBusy] = useState(false); const [error, setError] = useState("");
 const active = useRef(true); const controller = useRef<AbortController | null>(null);
 useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
 async function locations() {
  controller.current?.abort();
  setMoving(true); setError(""); setLocationsReady(false); setWardrobes([]); setWardrobe(""); setZone("");
  const abort = new AbortController(); controller.current = abort;
  try {
   const response = await fetch("/api/wardrobes", { signal: abort.signal });
   if (!response.ok) throw new Error();
   const data = browserWardrobesSchema.parse(await response.json());
   if (active.current && !abort.signal.aborted) { setWardrobes(data.wardrobes); setWardrobe(data.wardrobes[0]?.id ?? ""); setZone(""); setLocationsReady(true); }
  } catch { if (active.current && !abort.signal.aborted) setError("位置加载失败，请关闭后重试。"); }
 }
 async function mutate(action: "move" | "delete") {
  if (!selected || busy) return;
  if (action === "move" && (!locationsReady || !wardrobes.some((w) => w.id === wardrobeId && w.zones.some((z) => z.id === zoneId)))) return;
  setBusy(true); setError("");
  const abort = new AbortController(); controller.current = abort;
  try {
   const response = await fetch(`/api/items/${selected.id}${action === "move" ? "/move" : ""}`, { method: action === "move" ? "POST" : "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "move" ? { wardrobeId, zoneId } : {}), signal: abort.signal });
   if (!response.ok) throw new Error();
   if (active.current) { setSelected(null); onChanged(); }
  } catch { if (active.current && !abort.signal.aborted) setError("操作未完成，请重试。"); }
  finally { if (active.current) setBusy(false); }
 }
 return <><div className={styles.grid}>{items.map((item, index) => <ItemCard key={item.id} item={item} eager={index < 3} onManage={() => { setSelected(item); setMoving(false); setError(""); }} />)}</div>
  <BottomSheet open={Boolean(selected)} title={moving ? `移动「${selected?.name}」` : `管理「${selected?.name}」`} description={moving ? "选择衣柜和分区，衣物信息会完整保留。" : "移入回收站后，30 天内可以恢复。"} onClose={() => { if (!busy) { controller.current?.abort(); setSelected(null); } }}>
   {moving ? <div className={styles.form}>
    <label>目标衣柜<select value={wardrobeId} disabled={busy || !locationsReady} onChange={(e) => { setWardrobe(e.target.value); setZone(""); }}>{wardrobes.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
    <label>目标分区<select value={zoneId} disabled={busy || !locationsReady} onChange={(e) => setZone(e.target.value)}><option value="">选择分区</option>{wardrobes.find((w) => w.id === wardrobeId)?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
    <button className={styles.primary} disabled={!locationsReady || !zoneId || busy} onClick={() => void mutate("move")}>{busy ? "移动中…" : "确认移动"}</button>
   </div> : <div className={styles.form}><Link href={`/app/items/${selected?.id}`}>查看 / 编辑衣物</Link><button disabled={busy} onClick={() => void locations()}>移动衣物</button><button disabled={busy} onClick={() => void mutate("delete")}>{busy ? "移入中…" : "移入回收站"}</button></div>}
   {error && <p role="alert">{error}</p>}
  </BottomSheet>
 </>;
}
