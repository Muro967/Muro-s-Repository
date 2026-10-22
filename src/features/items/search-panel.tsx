"use client";
import { useState } from "react";
import { ItemGrid } from "./item-grid";
import { accessorySubcategories, itemCategories, itemStyles } from "./item-catalog";
import { useItemList } from "./use-item-list";
import styles from "./wardrobe-browser.module.css";

export function SearchPanel() {
 const [q, setQuery] = useState(""); const [categoryId, setCategory] = useState(""); const [styleId, setStyle] = useState(""); const [accessoryId, setAccessory] = useState("");
 const [cursor, setCursor] = useState(""); const [revision, setRevision] = useState(0);
 const params = new URLSearchParams({ scope: "browse" });
 for (const [key, value] of Object.entries({ q: q.trim(), categoryId, styleId, accessoryId, cursor })) if (value) params.set(key, value);
 const query = params.toString(); const { data, loading, error } = useItemList(query, 250, revision);
 function change(action: () => void) { setCursor(""); action(); }
 return <section className={styles.search} aria-label="搜索衣物">
  <label className={styles.searchField}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input type="search" aria-label="搜索衣物" placeholder="搜名称、颜色、分类、衣柜位置" value={q} onChange={(e) => change(() => setQuery([...e.target.value].slice(0, 80).join("")))} /></label>
  <fieldset className={styles.filter}><legend>分类</legend><div className={styles.chips}>{itemCategories.map((c) => <button key={c.id} aria-pressed={categoryId === c.id} onClick={() => change(() => { setCategory(categoryId === c.id ? "" : c.id); setAccessory(""); })}>{c.label}</button>)}</div></fieldset>
  {categoryId === "accessories" && <fieldset className={styles.filter}><legend>配饰</legend><div className={styles.chips}>{accessorySubcategories.map((c) => <button key={c.id} aria-pressed={accessoryId === c.id} onClick={() => change(() => setAccessory(accessoryId === c.id ? "" : c.id))}>{c.label}</button>)}</div></fieldset>}
  <fieldset className={styles.filter}><legend>风格</legend><div className={styles.styleChoices}>{itemStyles.map((s) => <button key={s.id} aria-pressed={styleId === s.id} onClick={() => change(() => setStyle(styleId === s.id ? "" : s.id))}>{s.label}</button>)}</div></fieldset>
  <div className={styles.heading}><h2>{data ? `找到 ${data.total} 件` : "搜索结果"}</h2><button className={styles.textButton} onClick={() => change(() => { setQuery(""); setCategory(""); setStyle(""); setAccessory(""); })}>清除</button></div>
  {loading && <p role="status">正在查找…</p>}{error && <p role="alert">{error}<button onClick={() => setRevision((n) => n + 1)}>重试</button></p>}
  {data && (data.items.length ? <ItemGrid key={`${query}:${revision}`} items={data.items} onChanged={() => { setCursor(""); setRevision((n) => n + 1); }} /> : <div className={styles.empty}><h3>{data.total === 0 ? "没有找到衣物" : "这一页没有衣物"}</h3><p>{data.total === 0 ? "换个词试试，比如「衬衫」或「米色」。" : "衣物可能已更新，请返回第一页查看。"}</p></div>)}
  {data?.nextCursor && <button className={styles.pageButton} onClick={() => setCursor(data.nextCursor!)}>下一页</button>}{cursor && <button className={styles.pageButton} onClick={() => setCursor("")}>返回第一页</button>}
 </section>;
}
