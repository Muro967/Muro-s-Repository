import type { ReactNode } from "react";
import { BottomTabs, type TabId } from "./bottom-tabs";
import styles from "./app-shell.module.css";

export function AppShell({ activeTab, children }: { activeTab: TabId; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <main className={styles.content}>{children}</main>
      <BottomTabs activeTab={activeTab} />
    </div>
  );
}
