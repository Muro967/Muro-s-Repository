"use client";

import type { WardrobeTree } from "./wardrobe-repository";
import styles from "./wardrobe-manager.module.css";

export type LocationValue = { wardrobeId: string; zoneId: string | null };
export function LocationPicker({ wardrobes, value, onChange, onConfirm, busy = false }: { wardrobes: WardrobeTree[]; value: LocationValue; onChange: (value: LocationValue) => void; onConfirm?: (value: LocationValue) => void; busy?: boolean }) {
  const wardrobe = wardrobes.find((entry) => entry.id === value.wardrobeId);
  const zone = wardrobe?.zones.find((entry) => entry.id === value.zoneId);
  return <div className={styles.picker}>
    <fieldset disabled={busy}><legend>放到哪个衣柜</legend><div className={styles.chips}>{wardrobes.map((entry) => <button key={entry.id} type="button" className={styles.chip} aria-pressed={entry.id === wardrobe?.id} onClick={() => onChange({ wardrobeId: entry.id, zoneId: null })}>{entry.name}</button>)}</div></fieldset>
    <fieldset disabled={busy}><legend>哪个分区</legend><div className={styles.chips}>{wardrobe?.zones.map((entry) => <button key={entry.id} type="button" className={styles.chip} aria-pressed={entry.id === zone?.id} onClick={() => onChange({ wardrobeId: wardrobe.id, zoneId: entry.id })}>{entry.name}</button>)}</div>{(!wardrobe || wardrobe.zones.length === 0) && <p className={styles.hint}>这个衣柜没有可选分区，请选择其他衣柜。</p>}</fieldset>
    {wardrobes.length === 0 && <p className={styles.hint}>没有可用的目标分区。请取消并先添加分区，再回来删除。</p>}
    <button type="button" className={styles.primary} disabled={!zone || busy} onClick={() => { if (zone) onConfirm?.({ wardrobeId: wardrobe!.id, zoneId: zone.id }); }}>{busy ? "正在保存…" : zone ? `移到 ${wardrobe!.name} › ${zone.name}` : "先选一个分区"}</button>
  </div>;
}
