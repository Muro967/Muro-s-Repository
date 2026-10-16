import Link from "next/link";
import { AppIcon } from "@/components/icons/app-icons";
import styles from "./bottom-tabs.module.css";

const tabs = [
  ["wardrobe", "/app/wardrobe", "衣橱"],
  ["outfits", "/app/outfits", "搭配"],
  ["inspiration", "/app/inspiration", "灵感"],
  ["profile", "/app/profile", "我的"],
] as const;

export type TabId = (typeof tabs)[number][0];

export function BottomTabs({ activeTab }: { activeTab: TabId }) {
  return (
    <nav className={styles.tabs} aria-label="主要页面">
      {tabs.map(([id, href, label]) => (
        <Link className={styles.tab} key={id} href={href} aria-current={id === activeTab ? "page" : undefined}>
          <AppIcon name={id} />
          <span>{label}</span>
          <span className={styles.dot} aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
