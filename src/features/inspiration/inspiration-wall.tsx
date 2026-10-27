"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BrandHeader } from "@/components/brand/brand-header";
import { AppShell } from "@/components/navigation/app-shell";

import { inspirationClient } from "./inspiration-client";
import type { InspirationDetail } from "./inspiration-types";
import styles from "./inspiration.module.css";

export function InspirationWall({
  load = inspirationClient.list,
}: {
  load?: (signal?: AbortSignal) => Promise<InspirationDetail[]>;
}) {
  const [items, setItems] = useState<InspirationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const value = await load(signal);
      if (!signal?.aborted) setItems(value);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "暂时无法加载灵感。");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => reload(controller.signal));
    return () => controller.abort();
  }, [reload]);

  const validCount = items.filter((item) =>
    item.styleTags.some(Boolean) || item.colorNames.some(Boolean)).length;
  const remaining = Math.max(0, 5 - validCount);

  return (
    <AppShell activeTab="inspiration">
      <BrandHeader />
      <section className={styles.progressCard} aria-labelledby="style-progress-title">
        <div>
          <p className={styles.eyebrow}>YOUR STYLE INDEX</p>
          <h2 id="style-progress-title">我的风格说明书</h2>
        </div>
        <div className={styles.pinRow} aria-label={`已收集 ${Math.min(validCount, 5)} / 5 张有效灵感`}>
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} data-filled={index < validCount} />
          ))}
        </div>
        {remaining > 0 ? (
          <><p>再添加 {remaining} 张，就能形成你的风格说明书</p><Link href="/app/inspiration/style">查看门槛说明 <span aria-hidden="true">›</span></Link></>
        ) : (
          <Link href="/app/inspiration/style">查看并编辑风格说明书 <span aria-hidden="true">›</span></Link>
        )}
      </section>

      <nav className={styles.wallActions} aria-label="添加灵感">
        <Link href="/app/inspiration/new?source=camera"><span aria-hidden="true">⌁</span>拍照</Link>
        <Link href="/app/inspiration/new?source=album"><span aria-hidden="true">▧</span>相册</Link>
        <Link href="/app/inspiration/new?source=clipboard"><span aria-hidden="true">⌘</span>粘贴截图</Link>
      </nav>

      {loading ? <p role="status" className={styles.loading}>正在整理灵感墙…</p> : null}
      {error ? (
        <div role="alert" className={styles.error}>
          {error}<button type="button" onClick={() => void reload()}>重试</button>
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <section className={styles.empty}>
          <span aria-hidden="true">✦</span>
          <h2>还没有灵感图</h2>
          <p>收集喜欢的穿搭，从第一张图开始认识自己的风格。</p>
        </section>
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <section className={styles.wallSection}>
          <header>
            <div>
              <p className={styles.eyebrow}>COLLECTED LOOKS</p>
              <h2>灵感墙</h2>
            </div>
            <span>{items.length} 张</span>
          </header>
          <div className={styles.masonry} data-layout="masonry">
            {items.map((item, index) => {
              const ai = item.analysisStatus === "ready" && item.analysisSource !== null;
              const aiStyles = ai && !item.confirmedFields.includes("styleTags");
              const aiColors = ai && !item.confirmedFields.includes("colorNames");
              return (
                <Link className={styles.inspirationCard} href={`/app/inspiration/${item.id}`} key={item.id}>
                  <div className={styles.cardImage} data-tall={index % 3 === 0}>
                    <Image
                      src={item.imageUrl}
                      alt={item.name || "未命名灵感"}
                      fill
                      sizes="(max-width: 480px) 46vw, 210px"
                      unoptimized
                    />
                  </div>
                  <div className={styles.cardCaption}>
                    {item.name ? <strong>{item.name}</strong> : null}
                    <div>
                      {item.styleTags.slice(0, 3).map((tag) => (
                        <span className={styles.tag} key={tag}>{aiStyles ? <i>AI</i> : null}{tag}</span>
                      ))}
                      {item.styleTags.length === 0 && item.colorNames.slice(0, 2).map((color) => (
                        <span className={styles.tag} key={color}>{aiColors ? <i>AI</i> : null}{color}</span>
                      ))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
