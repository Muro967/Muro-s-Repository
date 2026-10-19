"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import type { ClientError, ClientResult } from "@/features/auth/auth-client";
import { BottomSheet } from "@/components/overlays/bottom-sheet";
import { wardrobeClient } from "./wardrobe-client";
import type { WardrobeTree } from "./wardrobe-repository";
import type { ZoneKind } from "./wardrobe-types";
import { zoneKinds } from "./wardrobe-types";
import { LocationPicker, type LocationValue } from "./location-picker";
import { ZoneGrid, zoneKindLabels } from "./zone-grid";
import styles from "./wardrobe-manager.module.css";

type Target = { kind: "wardrobe" | "zone"; id: string; name: string };
type Sheet = { mode: "create"; kind: Target["kind"]; name: string } | { mode: "rename"; kind: Target["kind"]; id: string; name: string } | { mode: "delete"; target: Target } | { mode: "relocate"; target: Target };
function Failure({ error }: { error: ClientError | null }) {
  return error && <div role="alert" className={styles.error}><p>{error.message}</p>{error.code === "UNAUTHORIZED" && <Link href="/login">重新登录</Link>}</div>;
}

export function WardrobeManager() {
  const [wardrobes, setWardrobes] = useState<WardrobeTree[] | null>(null);
  const [wardrobeId, setWardrobeId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ZoneKind>("hang");
  const [location, setLocation] = useState<LocationValue>({ wardrobeId: "", zoneId: null });
  const [error, setError] = useState<ClientError | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const formId = useId();
  const wardrobe = wardrobes?.find((entry) => entry.id === wardrobeId) ?? wardrobes?.[0];
  const zone = wardrobe?.zones.find((entry) => entry.id === zoneId) ?? wardrobe?.zones[0];
  const load = useCallback(() => wardrobeClient.list().then((result) => {
    if (result.ok) { setWardrobes(result.value); setWardrobeId((current) => current ?? result.value[0]?.id ?? null); setZoneId((current) => current ?? result.value[0]?.zones[0]?.id ?? null); } else setError(result.error);
    setLoading(false);
  }), []);
  useEffect(() => { void load(); }, [load]);

  function open(next: Sheet) { setError(null); setNotice(""); setSheet(next); if (next.mode === "create" || next.mode === "rename") { setName(next.name); setKind("hang"); } }
  function close() { if (!busy) { setSheet(null); setError(null); } }
  async function mutate(operation: () => Promise<ClientResult<unknown>>, after?: (value: unknown) => void) {
    setBusy(true); setError(null); setNotice("");
    try {
      const result = await operation();
      if (!result.ok) {
        if (result.error.code === "LOCATION_REQUIRED" && sheet && (sheet.mode === "delete" || sheet.mode === "relocate")) {
          const targets = availableTargets(sheet.target);
          setLocation({ wardrobeId: targets[0]?.id ?? "", zoneId: null });
          setSheet({ mode: "relocate", target: sheet.target });
        } else setError(result.error);
        return;
      }
      after?.(result.value);
      const refreshed = await wardrobeClient.list();
      if (refreshed.ok) { setWardrobes(refreshed.value); setNotice("已保存"); }
      else setError({ ...refreshed.error, message: `修改已保存，但列表未能更新。${refreshed.error.message}` });
      setSheet(null);
    } finally { setBusy(false); }
  }
  function availableTargets(target: Target) { return (wardrobes ?? []).filter((entry) => target.kind !== "wardrobe" || entry.id !== target.id).map((entry) => ({ ...entry, zones: entry.zones.filter((entry) => target.kind !== "zone" || entry.id !== target.id) })).filter((entry) => entry.zones.length > 0); }
  function remove(target: Target, destinationZoneId?: string) { return mutate(() => target.kind === "wardrobe" ? wardrobeClient.deleteWardrobe(target.id, destinationZoneId) : wardrobeClient.deleteZone(target.id, destinationZoneId)); }
  function reorder(ids: string[], id: string, direction: number, wardrobeOnly: boolean) {
    const index = ids.indexOf(id); const other = index + direction;
    if (other < 0 || other >= ids.length) return;
    setWardrobeId(wardrobe!.id); setZoneId(zone?.id ?? null);
    [ids[index], ids[other]] = [ids[other], ids[index]];
    return mutate(() => wardrobeOnly ? wardrobeClient.reorderWardrobes(ids) : wardrobeClient.reorderZones(wardrobe!.id, ids));
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sheet || (sheet.mode !== "create" && sheet.mode !== "rename")) return;
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80) return;
    if (sheet.kind === "wardrobe") {
      if (sheet.mode === "create") void mutate(() => wardrobeClient.createWardrobe(cleanName), (value) => { setWardrobeId((value as WardrobeTree).id); setZoneId(null); });
      else void mutate(() => wardrobeClient.renameWardrobe(sheet.id!, cleanName));
    } else if (wardrobe) {
      if (sheet.mode === "create") void mutate(() => wardrobeClient.createZone(wardrobe.id, { name: cleanName, kind }), (value) => setZoneId((value as { id: string }).id));
      else void mutate(() => wardrobeClient.renameZone(sheet.id!, cleanName));
    }
  }
  const sheetTitle = !sheet ? "" : sheet.mode === "relocate" ? `先安置衣物，再删除「${sheet.target.name}」` : sheet.mode === "delete" ? `删除「${sheet.target.name}」` : `${sheet.mode === "create" ? "新建" : "重命名"}${sheet.kind === "wardrobe" ? "衣柜" : "分区"}`;
  const naming = sheet?.mode === "create" || sheet?.mode === "rename";
  return <>
    <h1 className={styles.title}>衣柜与分区</h1>
    <p className={styles.subtitle}>点分区查看里面的衣服，可以改名、增删分区</p>
    {!sheet && <Failure error={error} />}
    {!sheet && error && <button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => { setLoading(true); setError(null); void load(); }}>重试加载</button>}
    <p role="status" className={styles.status}>{loading ? "正在打开衣柜…" : busy ? "正在保存…" : notice}</p>
    {wardrobes && <>
      <div className={styles.wardrobes} role="group" aria-label="选择衣柜">{wardrobes.map((entry) => <button type="button" key={entry.id} className={styles.wardrobeTab} aria-label={`${entry.name} ${entry.zones.length} 个分区`} aria-pressed={entry.id === wardrobe?.id} disabled={busy} onClick={() => { setWardrobeId(entry.id); setZoneId(entry.zones[0]?.id ?? null); }}><strong>{entry.name}</strong><span>{entry.zones.length} 个分区</span></button>)}
        <button type="button" className={styles.addWardrobe} disabled={busy} onClick={() => open({ mode: "create", kind: "wardrobe", name: "" })}>＋ 新建衣柜</button>
      </div>
      {wardrobe ? <>
        <ZoneGrid wardrobeName={wardrobe.name} zones={wardrobe.zones} selectedId={zone?.id} busy={busy} onSelect={setZoneId} />
        <div className={styles.actions}><button type="button" className={styles.secondary} aria-expanded={editing} disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "完成编辑" : "编辑分区"}</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => open({ mode: "create", kind: "zone", name: "" })}>＋ 添加分区</button></div>
        {editing && <section className={styles.editor} aria-label="衣柜与分区编辑"><p className={styles.hint}>用按钮改名、调整顺序或删除。删除有衣物的分区时，需要先选择衣物移到哪里。</p>
          <div className={styles.editRow}><strong>{wardrobe.name}</strong><div className={styles.editControls}>
            <button type="button" disabled={busy} aria-label={`改名${wardrobe.name}`} onClick={() => open({ mode: "rename", kind: "wardrobe", id: wardrobe.id, name: wardrobe.name })}>改名</button>
            <button type="button" disabled={busy || wardrobes[0].id === wardrobe.id} aria-label={`前移${wardrobe.name}`} onClick={() => void reorder(wardrobes.map((w) => w.id), wardrobe.id, -1, true)}>前移</button>
            <button type="button" disabled={busy || wardrobes.at(-1)?.id === wardrobe.id} aria-label={`后移${wardrobe.name}`} onClick={() => void reorder(wardrobes.map((w) => w.id), wardrobe.id, 1, true)}>后移</button>
            <button type="button" className={styles.delete} disabled={busy} aria-label={`删除${wardrobe.name}`} onClick={() => open({ mode: "delete", target: { kind: "wardrobe", id: wardrobe.id, name: wardrobe.name } })}>删除</button>
          </div></div>
          {wardrobe.zones.map((entry, index) => <div className={styles.editRow} key={entry.id}><span>{entry.name}<small>{zoneKindLabels[entry.kind]}</small></span><div className={styles.editControls}>
            <button type="button" disabled={busy} aria-label={`改名${entry.name}`} onClick={() => open({ mode: "rename", kind: "zone", id: entry.id, name: entry.name })}>改名</button>
            <button type="button" disabled={busy || index === 0} aria-label={`上移${entry.name}`} onClick={() => void reorder(wardrobe.zones.map((z) => z.id), entry.id, -1, false)}>上移</button>
            <button type="button" disabled={busy || index === wardrobe.zones.length - 1} aria-label={`下移${entry.name}`} onClick={() => void reorder(wardrobe.zones.map((z) => z.id), entry.id, 1, false)}>下移</button>
            <button type="button" className={styles.delete} disabled={busy} aria-label={`删除${entry.name}`} onClick={() => open({ mode: "delete", target: { kind: "zone", id: entry.id, name: entry.name } })}>删除</button>
          </div></div>)}
        </section>}
        <section className={styles.items} aria-label="所选分区的衣物"><h2>{wardrobe.name}{zone ? ` › ${zone.name}` : ""}</h2><div className={styles.empty}>{zone ? <><h3>衣物列表暂不可列出</h3><p>衣柜和分区已连接。这里稍后会显示此分区的真实衣物。</p></> : <><h3>这个衣柜还没有分区</h3><p>添加第一个分区，给衣物安排一个位置。</p></>}</div></section>
      </> : <div className={styles.empty}><h2>从一个衣柜开始</h2><p>新建衣柜，再按你的收纳习惯添加分区。</p></div>}
    </>}
    <BottomSheet open={sheet !== null} title={sheetTitle} onClose={close} description={sheet?.mode === "relocate" ? "请选择保留的目标分区。确认后会移动其中的衣物，并删除原位置。" : undefined}>
      <Failure error={error} />
      {naming && <form onSubmit={save} className={styles.form}><label htmlFor={`${formId}-name`}>{sheet.kind === "wardrobe" ? "衣柜名称" : "分区名称"}</label><input id={`${formId}-name`} data-sheet-autofocus required maxLength={80} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} autoComplete="off" />
        {sheet.kind === "zone" && sheet.mode === "create" && <><label htmlFor={`${formId}-kind`}>分区类型</label><select id={`${formId}-kind`} value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as ZoneKind)}>{zoneKinds.map((entry) => <option value={entry} key={entry}>{zoneKindLabels[entry]}</option>)}</select></>}
        <button className={styles.primary} disabled={busy || !name.trim()} type="submit">{busy ? "正在保存…" : sheet.kind === "wardrobe" ? "保存衣柜" : "保存分区"}</button>
      </form>}
      {sheet?.mode === "delete" && <><p className={styles.hint}>确认删除这个{sheet.target.kind === "wardrobe" ? "衣柜及其中的分区" : "分区"}？如果里面有衣物，下一步会请你选择安置位置。</p><button type="button" className={styles.primary} disabled={busy} onClick={() => void remove(sheet.target)}>{busy ? "正在检查…" : `确认删除${sheet.target.kind === "wardrobe" ? "衣柜" : "分区"}`}</button></>}
      {sheet?.mode === "relocate" && <LocationPicker wardrobes={availableTargets(sheet.target)} value={location} onChange={setLocation} busy={busy} onConfirm={(value) => void remove(sheet.target, value.zoneId!)} />}
    </BottomSheet>
  </>;
}
