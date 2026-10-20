import Link from "next/link";
import Image from "next/image";
import type { BrowserItem } from "./item-browser-contract";
import styles from "./wardrobe-browser.module.css";

export function ItemCard({ item, onManage, eager = false }: { item: BrowserItem; onManage?: () => void; eager?: boolean }) {
 return <article className={styles.card}>
  <Link href={`/app/items/${item.id}`} className={styles.itemLink}>
   <div className={styles.image}>{item.original ? <Image src={item.original.contentUrl} alt={item.name} width={160} height={160} unoptimized loading={eager ? "eager" : "lazy"} /> : <span className={styles.noImage}>暂无照片</span>}</div>
   <h3>{item.name || "未命名草稿"}</h3>
   <p>{item.manualLastWornOn ? `最后穿着 ${item.manualLastWornOn}` : "未填写最后穿着"}</p>
   <p className={styles.location}>{[item.wardrobeName, item.zoneName].filter(Boolean).join(" · ") || "尚未选择位置"}</p>
   {item.status === "watching" && <span className={styles.badge}>观察中</span>}
   {item.isIdle && <span className={styles.badge}>闲置</span>}
  </Link>
  {onManage && <button className={styles.manage} type="button" aria-label={`管理${item.name || "未命名草稿"}`} onClick={onManage}>···</button>}
 </article>;
}
