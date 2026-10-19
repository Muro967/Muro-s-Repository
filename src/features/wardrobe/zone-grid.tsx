"use client";

import type { Zone } from "./wardrobe-repository";
import type { ZoneKind } from "./wardrobe-types";
import styles from "./wardrobe-manager.module.css";

export const zoneKindLabels: Record<ZoneKind, string> = { hang: "挂衣区", shelf: "层板", drawer: "抽屉", shoe: "鞋层" };
export function ZoneGrid({ wardrobeName, zones, selectedId, onSelect, busy = false }: { wardrobeName: string; zones: Zone[]; selectedId?: string; onSelect: (id: string) => void; busy?: boolean }) {
  return <div className={styles.cabinet} role="group" aria-label={`${wardrobeName}的分区`}>
    {zones.map((zone) => <button key={zone.id} type="button" disabled={busy} className={styles.zone} data-kind={zone.kind} aria-label={`${zone.name}，${zoneKindLabels[zone.kind]}`} aria-pressed={zone.id === selectedId} onClick={() => onSelect(zone.id)}>
      <span className={styles.zoneName}>{zone.name}</span>
      <span className={styles.zoneDrawing} aria-hidden="true">{zone.kind === "hang" && <svg viewBox="0 0 100 68"><path d="M4 8h92M32 15c0-8 12-8 12 0 0 4-6 6-6 10L16 39h44L38 25M67 15c0-8 12-8 12 0 0 4-6 6-6 10L51 39h44L73 25" /></svg>}</span>
      <span className={styles.zoneKind}>{zoneKindLabels[zone.kind]}</span>
    </button>)}
    {zones.length === 0 && <p className={styles.cabinetEmpty}>给衣柜添一个分区<br /><span>挂衣区、层板、抽屉或鞋层</span></p>}
  </div>;
}
