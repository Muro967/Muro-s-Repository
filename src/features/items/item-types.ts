import type { accessorySubcategories, itemCategories, itemStyles, seasons } from "./item-catalog";

export type CategoryId = (typeof itemCategories)[number]["id"];
export type AccessoryId = (typeof accessorySubcategories)[number]["id"];
export type StyleId = (typeof itemStyles)[number]["id"];
export type SeasonId = (typeof seasons)[number]["id"];

export const itemStatuses = ["draft", "active", "watching", "disposed"] as const;
export type ItemStatus = (typeof itemStatuses)[number];
