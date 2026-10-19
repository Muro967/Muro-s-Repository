"use client";

import { useEffect, useState } from "react";
import styles from "./install-guidance.module.css";

const DISMISSED_KEY = "ai-wardrobe-install-guidance-dismissed";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosSafari() {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIos && !("standalone" in navigator && navigator.standalone === true);
}

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default function InstallGuidance() {
  const [ios, setIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    // Read browser-only platform and storage state after hydration to keep SSR markup stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(isIosSafari());
    setDismissed(wasDismissed());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Dismissal still works for this render when storage is disabled.
    }
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice?.catch(() => undefined);
    if (choice?.outcome === "accepted") dismiss();
    setInstallPrompt(null);
  };

  const visible = !dismissed && (ios || installPrompt !== null);
  if (!visible) return null;

  return (
    <aside className={styles.guidance} aria-label="安装 AI Wardrobe">
      <div className={styles.copy}>
        <p className={styles.title}>把 AI Wardrobe 放到主屏幕</p>
        {ios ? (
          <p className={styles.description}>轻点 Safari 的分享按钮，再选择“添加到主屏幕”。</p>
        ) : (
          <p className={styles.description}>安装后可以从主屏幕快速打开。</p>
        )}
      </div>
      {installPrompt ? <button className={styles.install} onClick={() => void install()}>安装应用</button> : null}
      <button className={styles.dismiss} aria-label="关闭安装提示" onClick={dismiss}>关闭</button>
    </aside>
  );
}
