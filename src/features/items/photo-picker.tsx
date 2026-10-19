"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import styles from "./item-editor.module.css";

export function PhotoPicker({ onSelect, disabled = false }: { onSelect: (file: File) => void; disabled?: boolean }) {
  const id = useId(); const camera = useRef<HTMLInputElement>(null); const album = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || /\.hei[cf]$/i.test(file.name)) { setError("暂不支持 HEIC 照片，请先转为 JPEG、PNG 或 WebP 后再选择。"); return; }
    if (file.size === 0 || file.size > 15 * 1024 * 1024) { setError("请选择小于或等于 15 MB 的完整照片。"); return; }
    setError(null); onSelect(file);
  }
  return <div className={styles.photoPicker}>
    <input hidden id={`${id}-camera`} ref={camera} aria-label="拍照" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choose} disabled={disabled} />
    <input hidden id={`${id}-album`} ref={album} aria-label="从相册选择" type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={disabled} />
    <div className={styles.photoActions}><button type="button" onClick={() => camera.current?.click()} disabled={disabled}>拍照</button><button type="button" onClick={() => album.current?.click()} disabled={disabled}>从相册选择</button></div>
    <p className={styles.hint}>JPEG、PNG 或 WebP，最大 15 MB。HEIC 请先转换格式。</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
