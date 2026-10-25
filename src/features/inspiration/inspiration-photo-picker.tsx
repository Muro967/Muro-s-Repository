"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";

import styles from "./inspiration.module.css";

const supported = new Set(["image/jpeg", "image/png", "image/webp"]);

function validationMessage(file: File) {
  if (!supported.has(file.type) || /\.hei[cf]$/i.test(file.name)) {
    return "暂不支持 HEIC 照片，请先转为 JPEG、PNG 或 WebP。";
  }
  if (file.size === 0 || file.size > 15 * 1024 * 1024) {
    return "请选择小于或等于 15 MB 的完整照片。";
  }
  return null;
}

export function InspirationPhotoPicker({
  onSelect,
  disabled = false,
}: {
  onSelect: (file: File) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function accept(file: File | undefined) {
    if (!file) return;
    const message = validationMessage(file);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    onSelect(file);
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    accept(file);
  }

  async function paste() {
    setError(null);
    try {
      if (!navigator.clipboard?.read) throw new Error("unsupported");
      const entries = await navigator.clipboard.read();
      for (const entry of entries) {
        const type = entry.types.find((candidate) => supported.has(candidate));
        if (!type) continue;
        const blob = await entry.getType(type);
        accept(blob instanceof File
          ? blob
          : new File([blob], "clipboard-image", { type }));
        return;
      }
      setError("剪贴板里没有可用的图片，请先复制一张截图。");
    } catch {
      setError("无法读取剪贴板。请允许访问，或改用相册选择。");
    }
  }

  return (
    <div className={styles.photoPicker}>
      <input
        hidden
        id={`${id}-camera`}
        ref={camera}
        aria-label="拍照添加灵感"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        disabled={disabled}
        onChange={choose}
      />
      <input
        hidden
        id={`${id}-album`}
        ref={album}
        aria-label="从相册添加灵感"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={choose}
      />
      <div className={styles.addActions}>
        <button type="button" disabled={disabled} onClick={() => camera.current?.click()}>
          <span aria-hidden="true">⌁</span>拍照
        </button>
        <button type="button" disabled={disabled} onClick={() => album.current?.click()}>
          <span aria-hidden="true">▧</span>相册
        </button>
        <button type="button" disabled={disabled} onClick={() => void paste()}>
          <span aria-hidden="true">⌘</span>粘贴截图
        </button>
      </div>
      <p className={styles.hint}>JPEG、PNG 或 WebP，最大 15 MB；HEIC 暂不支持。</p>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </div>
  );
}
