export const zoneKinds = ["hang", "shelf", "drawer", "shoe"] as const;

export type ZoneKind = (typeof zoneKinds)[number];
