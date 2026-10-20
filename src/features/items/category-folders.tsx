import type { BrowserResponse } from "./item-browser-contract";
import Image from "next/image";
import { itemCategories, itemStyles } from "./item-catalog";
import styles from "./wardrobe-browser.module.css";
export function CategoryFolders({ data, mode, selected, onMode, onSelect }: { data?: BrowserResponse; mode: "categories" | "styles"; selected: string; onMode: (mode: "categories" | "styles") => void; onSelect: (id: string) => void }) {
 const choices = mode === "categories" ? itemCategories : itemStyles;
 return <section aria-label="分类与风格"><div className={styles.heading}><div className={styles.groupToggle}><button aria-pressed={mode === "categories"} onClick={() => onMode("categories")}>分类</button><span>·</span><button aria-pressed={mode === "styles"} onClick={() => onMode("styles")}>风格</button></div></div>
  <div key={mode} className={styles.folders}>{[{ id: "", label: "全部" }, ...choices].map((choice) => <button key={choice.id} className={styles.folder} aria-pressed={selected === choice.id} onClick={() => onSelect(choice.id)}>
   <div className={styles.folderArt} aria-hidden="true">{data?.items.filter((item) => item.original && (!choice.id || (mode === "categories" ? item.categoryId === choice.id : item.styleIds.includes(choice.id)))).slice(0, 3).map((item) => <span key={item.id}><Image src={item.original!.contentUrl} alt="" width={60} height={75} unoptimized /></span>)}</div><strong>{choice.label}</strong><small>{choice.id ? data?.facets[mode][choice.id] ?? 0 : data?.summary.itemCount ?? 0} 件</small>
  </button>)}</div>
 </section>;
}
