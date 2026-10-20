"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/overlays/bottom-sheet";
import { LocationPicker, type LocationValue } from "@/features/wardrobe/location-picker";
import { wardrobeClient } from "@/features/wardrobe/wardrobe-client";
import type { WardrobeTree } from "@/features/wardrobe/wardrobe-repository";
import { accessorySubcategories, itemCategories, itemStyles, seasons } from "./item-catalog";
import { itemEditorClient, type EditorItem } from "./item-editor-client";
import type { EditableItemPatch } from "./item-repository";
import { ItemClientError } from "./item-upload-client";
import { PhotoPicker } from "./photo-picker";
import { useItemUpload, type SubmitUpload } from "./use-item-upload";
import { WatchWearForm } from "../idle/watch-wear-form";
import styles from "./item-editor.module.css";

type Form = Required<EditableItemPatch>;
const emptyForm = (): Form => ({ name: "", categoryId: null, accessoryId: null, colorNames: [], colorHexes: [], styleIds: [], seasonIds: [], thickness: null, material: null, fit: null, length: null, formality: null, brand: null, notes: null, wardrobeId: null, zoneId: null, manualLastWornOn: null });
function formFrom(item: EditorItem): Form { return Object.fromEntries(Object.keys(emptyForm()).map((key) => [key, item[key as keyof Form]])) as Form; }
const message = (error: unknown) => error instanceof Error ? error.message : "暂时无法连接，请重试。";
type UnconfirmedAttachment = { itemId: string; uploadId: string };
function confirmedAttachFailure(error: unknown) {
  if (!(error instanceof ItemClientError)) return false;
  const knownFailures: Record<number, string[]> = { 400: ["INVALID_INPUT", "INVALID_IMAGE"], 401: ["UNAUTHORIZED"], 403: ["ORIGIN_MISMATCH"], 404: ["NOT_FOUND"], 409: ["ITEM_INCOMPLETE", "ITEM_NOT_EDITABLE", "ASSET_CONFLICT"] };
  return error.status !== undefined && knownFailures[error.status]?.includes(error.code) === true;
}

export function ItemEditor({ itemId, submitUpload }: { itemId?: string; submitUpload?: SubmitUpload }) {
  const [form, setForm] = useState<Form>(emptyForm);
  const [item, setItem] = useState<EditorItem | null>(null);
  const currentId = useRef(itemId);
  const pendingDraft = useRef<Promise<string> | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const attachQueue = useRef<Promise<unknown>>(Promise.resolve());
  const unconfirmedAttachment = useRef<UnconfirmedAttachment | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<UnconfirmedAttachment | null>(null);
  const [checkingAttachment, setCheckingAttachment] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!itemId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wardrobes, setWardrobes] = useState<WardrobeTree[]>([]);
  const [wardrobeError, setWardrobeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [saved, setSaved] = useState<"draft" | "active" | null>(null);
  const [sheet, setSheet] = useState<"location" | "styles" | null>(null);
  const [location, setLocation] = useState<LocationValue>({ wardrobeId: "", zoneId: null });
  const [colorNames, setColorNames] = useState("");
  const [colorHexes, setColorHexes] = useState("");
  const [wearRecorded, setWearRecorded] = useState(false);
  const wearStatus = useRef<HTMLDivElement>(null);
  useEffect(() => { if (wearRecorded) wearStatus.current?.focus(); }, [wearRecorded]);

  async function ensureDraft(): Promise<string> {
    if (currentId.current) return currentId.current;
    if (!pendingDraft.current) {
      pendingDraft.current = itemEditorClient.create(lifecycle.current?.signal).then((value) => { currentId.current = value.id; setItem(value); return value.id; }).finally(() => { pendingDraft.current = null; });
    }
    return pendingDraft.current;
  }
  const upload = useItemUpload(async (uploadId, isCurrent) => {
    const id = await ensureDraft();
    if (!isCurrent()) return;
    // An accepted write outlives selection cancellation: wait for its response
    // before allowing another write, rather than aborting only the transport.
    const operation = attachQueue.current.catch(() => {}).then(async () => {
      if (!isCurrent()) return;
      if (unconfirmedAttachment.current) throw new Error("照片绑定结果未确认，请先核对服务器照片。");
      try { await itemEditorClient.attach(id, uploadId); }
      catch (error) {
        if (!confirmedAttachFailure(error)) {
          unconfirmedAttachment.current = { itemId: id, uploadId };
          if (!lifecycle.current?.signal.aborted) setUnconfirmed(unconfirmedAttachment.current);
        }
        throw error;
      }
    });
    attachQueue.current = operation;
    await operation;
  }, submitUpload);

  async function checkAttachment() {
    const pending = unconfirmedAttachment.current;
    if (!pending || checkingAttachment) return;
    setCheckingAttachment(true); setConfirmationError(null);
    try {
      const value = await itemEditorClient.read(pending.itemId, lifecycle.current?.signal);
      if (lifecycle.current?.signal.aborted) return;
      // A mismatching snapshot cannot prove the older write has finished.
      // Only observing that exact upload bound proves its transaction committed.
      if (value.original?.uploadId !== pending.uploadId) { setConfirmationError("服务器尚未确认这张照片，请稍后再次核对。确认前不能继续绑定。"); return; }
      setItem(value); upload.confirmAttached(pending.uploadId); unconfirmedAttachment.current = null; setUnconfirmed(null);
    } catch (error) { if (!lifecycle.current?.signal.aborted) setConfirmationError(message(error)); }
    finally { if (!lifecycle.current?.signal.aborted) setCheckingAttachment(false); }
  }

  const loadItem = useCallback(async (signal?: AbortSignal) => {
    if (!itemId) return;
    setLoading(true); setLoadError(null);
    try {
      const value = await itemEditorClient.read(itemId, signal);
      if (signal?.aborted) return;
      setItem(value); setForm(formFrom(value)); setColorNames(value.colorNames.join(" / ")); setColorHexes(value.colorHexes.join(" / "));
    } catch (error) { if (!signal?.aborted) { setLoadError(message(error)); setAuthError(error instanceof ItemClientError && error.code === "UNAUTHORIZED"); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [itemId]);
  const loadWardrobes = useCallback(async () => {
    const result = await wardrobeClient.list();
    if (lifecycle.current?.signal.aborted) return;
    if (result.ok) { setWardrobes(result.value); setWardrobeError(null); }
    else setWardrobeError(result.error.message);
  }, []);
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    void Promise.resolve().then(() => { if (!controller.signal.aborted) { void loadItem(controller.signal); void loadWardrobes(); } });
    return () => controller.abort();
  }, [loadItem, loadWardrobes]);

  function change<K extends keyof Form>(key: K, value: Form[K]) { setForm((previous) => ({ ...previous, [key]: value })); setSaved(null); setSaveError(null); setWearRecorded(false); }
  const names = colorNames.split(/[/／,，、]/).map((value) => value.trim()).filter(Boolean);
  const hexes = colorHexes.split(/[/／,，、\s]+/).map((value) => value.trim().toUpperCase()).filter(Boolean);
  const colorValid = names.length <= 8 && names.every((value) => [...value].length <= 32) && new Set(names).size === names.length && hexes.length <= 8 && hexes.every((value) => /^#[0-9A-F]{6}$/.test(value)) && new Set(hexes).size === hexes.length;
  const photoReady = upload.state === "ready" || (upload.state === "empty" && !!item?.original);
  const canActivate = !!form.name.trim() && !!form.categoryId && (form.categoryId !== "accessories" || !!form.accessoryId) && !!form.wardrobeId && !!form.zoneId && photoReady && colorValid;
  const uploadBusy = upload.state === "uploading";
  const editable = !item || (!item.deletedAt && ["draft", "active"].includes(item.status));
  const canRecordWear = !!item && !item.deletedAt && item.status === "watching";
  async function save(activate: boolean) {
    if (busy || uploadBusy || unconfirmedAttachment.current || !editable) return;
    if (!colorValid) { setSaveError("保存资料失败：颜色名最多 8 个，色值请使用 # 加六位十六进制字符，且不要重复。"); return; }
    setBusy(true); setSaveError(null); setSaved(null);
    try {
      const id = await ensureDraft();
      const value = await itemEditorClient.save(id, { ...form, name: form.name.trim(), colorNames: names, colorHexes: hexes }, lifecycle.current?.signal);
      if (lifecycle.current?.signal.aborted) return;
      setItem(value);
      if (activate) {
        const active = await itemEditorClient.activate(id, lifecycle.current?.signal);
        if (lifecycle.current?.signal.aborted) return;
        setItem(active); setSaved("active");
      } else setSaved("draft");
    } catch (error) { if (!lifecycle.current?.signal.aborted) { setSaveError(`保存资料失败：${message(error)}`); setAuthError(error instanceof ItemClientError && error.code === "UNAUTHORIZED"); } }
    finally { if (!lifecycle.current?.signal.aborted) setBusy(false); }
  }
  function addAnother() {
    if (!saved) return;
    upload.reset(); currentId.current = undefined; pendingDraft.current = null; setItem(null); setForm(emptyForm()); setColorNames(""); setColorHexes(""); setSaved(null); setSaveError(null);
  }
  const wardrobe = wardrobes.find((value) => value.id === form.wardrobeId);
  const zone = wardrobe?.zones.find((value) => value.id === form.zoneId);
  const preview = upload.preview ?? (item?.original ? `/api/items/${item.id}/assets/${item.original.id}/content` : null);
  return <div className={styles.editor}>
    <header className={styles.heading}><h1>{canRecordWear ? "观察中的衣物" : itemId ? "编辑衣物" : "添加衣物"}</h1><p>{canRecordWear ? "手动记下实际穿着日期，更新这件衣物的观察状态。" : "选一张照片，记下这件衣物的资料与位置。"}</p></header>
    {loading && <p role="status">正在加载衣物…</p>}
    {loadError && <div role="alert" className={styles.error}>{loadError}<button type="button" onClick={() => void loadItem(lifecycle.current?.signal)}>重试加载衣物</button></div>}
    {!loading && !loadError && <>
      {canRecordWear && <WatchWearForm key={`${item.id}:${item.watchStartedOn}`} item={item} onReload={() => void loadItem(lifecycle.current?.signal)} onSaved={(value) => {
        setItem(value); setForm(formFrom(value)); setColorNames(value.colorNames.join(" / ")); setColorHexes(value.colorHexes.join(" / ")); setSaved(null); setWearRecorded(true);
      }} />}
      <div className={styles.preview}>{preview ? <Image src={preview} alt="衣物照片预览" width={800} height={800} unoptimized /> : <div className={styles.photoEmpty}><span aria-hidden="true">＋</span><p>留下它原本的样子</p><small>也可以先保存资料，稍后补照片</small></div>}</div>
      <PhotoPicker disabled={busy || !!unconfirmed || !editable} onSelect={(file) => { setSaved(null); upload.select(file); }} />
      <div className={styles.status} role="status" tabIndex={-1} ref={wearStatus}>{wearRecorded ? "已记录手动穿着日期，已退出观察。" : unconfirmed ? "照片绑定结果未确认" : uploadBusy ? "正在上传" : saved ? saved === "active" ? "已保存到衣橱" : "已保存" : upload.state === "ready" ? "照片已上传" : ""}</div>
      {wearRecorded && <Link className={styles.secondary} href="/app/idle">返回闲置衣物</Link>}
      {unconfirmed && <div role="alert" className={styles.error}><p>照片绑定结果未确认。为避免旧照片覆盖新照片，暂不能继续绑定或保存。请核对服务器照片后再重试。</p>{confirmationError && <p>{confirmationError}</p>}<button type="button" onClick={() => void checkAttachment()} disabled={checkingAttachment}>{checkingAttachment ? "正在核对…" : "核对服务器照片"}</button></div>}
      {upload.state === "retry" && !unconfirmed && <div role="alert" className={styles.error}><p>需要重试：{upload.error}</p><button type="button" onClick={upload.retry} disabled={busy}>重试照片</button></div>}
      {!editable && !canRecordWear && <p role="alert" className={styles.error}>这件衣物目前不能编辑。</p>}
      <form onSubmit={(event) => { event.preventDefault(); void save(false); }}>
        <fieldset className={styles.card} disabled={busy || !editable}>
          <legend className={styles.visuallyHidden}>衣物资料</legend>
          <label className={styles.field}><span>名称</span><input value={form.name} maxLength={80} onChange={(event) => change("name", event.target.value)} placeholder="给这件衣物起个名字" /></label>
          <label className={styles.field}><span>分类</span><select value={form.categoryId ?? ""} onChange={(event) => { change("categoryId", event.target.value as Form["categoryId"] || null); change("accessoryId", null); }}><option value="">请选择</option>{itemCategories.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
          {form.categoryId === "accessories" && <label className={styles.field}><span>配饰类别</span><select value={form.accessoryId ?? ""} onChange={(event) => change("accessoryId", event.target.value as Form["accessoryId"] || null)}><option value="">请选择</option>{accessorySubcategories.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>}
          <label className={styles.field}><span>颜色名</span><input value={colorNames} onChange={(event) => { setColorNames(event.target.value); setSaved(null); }} placeholder="如：焦糖 / 米白" /></label>
          <label className={styles.field}><span>颜色色值</span><input value={colorHexes} onChange={(event) => { setColorHexes(event.target.value); setSaved(null); }} placeholder="如：#B8977F / #FBF9F6" aria-describedby="color-help" /></label>
          <div className={styles.colorHelp} id="color-help">可填多个颜色，用 / 分隔；色值可留空。<span className={styles.swatches}>{hexes.filter((value) => /^#[0-9A-F]{6}$/.test(value)).map((value, index) => <span key={`${value}-${index}`} style={{ background: value }} title={value} />)}</span></div>
          <div className={styles.row}><span>放在哪里</span><button type="button" onClick={() => { setLocation({ wardrobeId: form.wardrobeId ?? wardrobes[0]?.id ?? "", zoneId: form.zoneId }); setSheet("location"); }}>{wardrobe && zone ? `${wardrobe.name} › ${zone.name}` : "选择衣柜与分区"}<span aria-hidden="true"> ›</span></button></div>
          <div className={styles.row}><span>风格</span><button type="button" onClick={() => setSheet("styles")}>{form.styleIds.length ? form.styleIds.map((id) => itemStyles.find((value) => value.id === id)?.label).join("、") : "选择风格（选填）"}<span aria-hidden="true"> ›</span></button></div>
          <div className={styles.seasonRow}><span>季节</span><div className={styles.chips}>{seasons.map((season) => <button key={season.id} type="button" aria-pressed={form.seasonIds.includes(season.id)} onClick={() => change("seasonIds", form.seasonIds.includes(season.id) ? form.seasonIds.filter((id) => id !== season.id) : [...form.seasonIds, season.id])}>{season.label}</button>)}</div></div>
        </fieldset>
        <details className={styles.details}><summary>更多资料 <span>材质、版型、品牌与穿着日期</span></summary><fieldset className={styles.card} disabled={busy || !editable}><legend className={styles.visuallyHidden}>更多资料</legend>
          {([{ key: "thickness", label: "厚薄" }, { key: "material", label: "材质" }, { key: "fit", label: "版型" }, { key: "length", label: "衣长 / 裤长" }, { key: "formality", label: "正式程度" }, { key: "brand", label: "品牌" }] as const).map(({ key, label }) => <label key={key} className={styles.field}><span>{label}</span><input maxLength={80} value={form[key] ?? ""} onChange={(event) => change(key, event.target.value || null)} placeholder="选填" /></label>)}
          <label className={styles.field}><span>最近穿着日期</span><input type="date" max={new Date().toLocaleDateString("en-CA")} value={form.manualLastWornOn ?? ""} onChange={(event) => change("manualLastWornOn", event.target.value || null)} /></label>
          <label className={`${styles.field} ${styles.notes}`}><span>备注</span><textarea maxLength={1000} value={form.notes ?? ""} onChange={(event) => change("notes", event.target.value || null)} placeholder="选填" rows={3} /></label>
        </fieldset></details>
        {saveError && <p role="alert" className={styles.error}>{saveError}</p>}
        <p className={styles.hint}>草稿可以暂缺照片和位置。保存到衣橱需有名称、分类、照片和分区。尚未上传的照片仅在当前页面保留，关闭后请重新选择。</p>
        <div className={styles.footer}>{itemId && saved && !busy && !uploadBusy && !unconfirmed ? <Link className={styles.secondary} href="/app/items/new">再添加一件</Link> : <button type="button" className={styles.secondary} disabled={!saved || busy || uploadBusy || !!unconfirmed} onClick={addAnother}>再添加一件</button>}<button className={styles.secondary} type="submit" disabled={busy || uploadBusy || !!unconfirmed || !editable}>{busy ? "正在保存…" : "保存草稿"}</button><button type="button" className={styles.primary} disabled={!canActivate || busy || uploadBusy || !!unconfirmed || !editable} onClick={() => void save(true)}>保存到衣橱</button></div>
      </form>
    </>}
    {authError && <Link href="/login">重新登录</Link>}
    <BottomSheet open={sheet === "location"} title="放在哪里" description="选择这件衣物实际存放的衣柜与分区。" onClose={() => setSheet(null)}>
      {wardrobeError ? <div role="alert"><p>{wardrobeError}</p><button type="button" onClick={() => void loadWardrobes()}>重试加载衣柜</button></div> : wardrobes.length ? <LocationPicker wardrobes={wardrobes} value={location} onChange={setLocation} onConfirm={(value) => { change("wardrobeId", value.wardrobeId); change("zoneId", value.zoneId); setSheet(null); }} /> : <p>还没有可选分区，请先<Link href="/app/wardrobes">管理衣柜与分区</Link>。</p>}
      <button type="button" className={styles.clearLocation} onClick={() => { change("wardrobeId", null); change("zoneId", null); setSheet(null); }}>暂不设置位置</button>
    </BottomSheet>
    <BottomSheet open={sheet === "styles"} title="选择风格" description="选填，最多选择 12 种。" onClose={() => setSheet(null)}><div className={styles.chips}>{itemStyles.map((style) => <button type="button" key={style.id} aria-pressed={form.styleIds.includes(style.id)} disabled={form.styleIds.length >= 12 && !form.styleIds.includes(style.id)} onClick={() => change("styleIds", form.styleIds.includes(style.id) ? form.styleIds.filter((id) => id !== style.id) : [...form.styleIds, style.id])}>{style.label}</button>)}</div><button type="button" className={`${styles.primary} ${styles.sheetDone}`} onClick={() => setSheet(null)}>完成选择</button></BottomSheet>
  </div>;
}
