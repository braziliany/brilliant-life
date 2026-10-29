import { validDate } from "../../api/validation.ts";
import { ITEM_STATUSES, WISH_STATUSES, stoppedHolding, type ItemInput, type WishInput, type UseInput } from "./domain.ts";

export const validId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
export function objectOnly(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}
const text = (value: unknown, max: number, required = false) => typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);
const nullableText = (value: unknown, max: number) => value == null || text(value, max);
const money = (value: unknown) => value == null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
const date = (value: unknown) => value == null || validDate(value);
export const ITEM_KEYS = ["name", "category", "brandModel", "purchaseDate", "purchasePriceCents", "notes", "status", "endedDate"];
export const WISH_KEYS = ["name", "budgetCents", "plannedDate", "notes", "status"];

export function parseItem(value: unknown, today: string): ItemInput | null {
  if (!objectOnly(value, ITEM_KEYS)) return null;
  const v: Record<string, unknown> = { brandModel: null, purchaseDate: null, purchasePriceCents: null, notes: "", status: "in_use", endedDate: null, ...value };
  if (!text(v.name, 120, true) || !text(v.category, 60, true) || !nullableText(v.brandModel, 120) || !text(v.notes, 2000) ||
    typeof v.status !== "string" || !Object.hasOwn(ITEM_STATUSES, v.status) || !date(v.purchaseDate) || !date(v.endedDate) || !money(v.purchasePriceCents)) return null;
  const item = v as ItemInput;
  if ((item.purchaseDate && item.purchaseDate > today) || (item.endedDate && item.endedDate > today)) return null;
  if (stoppedHolding(item.status) ? !item.endedDate : item.endedDate !== null) return null;
  if (item.purchaseDate && item.endedDate && item.endedDate < item.purchaseDate) return null;
  return { ...item, name: item.name.trim(), category: item.category.trim(), brandModel: item.brandModel?.trim() || null };
}
export function parseWish(value: unknown): WishInput | null {
  if (!objectOnly(value, WISH_KEYS)) return null;
  const v: Record<string, unknown> = { budgetCents: null, plannedDate: null, notes: "", status: "wanted", ...value };
  if (!text(v.name, 120, true) || !text(v.notes, 2000) || !money(v.budgetCents) || !date(v.plannedDate) || typeof v.status !== "string" || !Object.hasOwn(WISH_STATUSES, v.status)) return null;
  return { ...v, name: (v.name as string).trim() } as WishInput;
}
export function parseUse(value: unknown, today: string): UseInput | null {
  if (!objectOnly(value, ["itemId", "usedOn", "count", "note"])) return null;
  const v: Record<string, unknown> = { count: 1, note: "", ...value };
  if (!validId(v.itemId) || !validDate(v.usedOn) || v.usedOn > today || !text(v.note, 500) || !validId(v.count) || v.count > 1000000) return null;
  return v as UseInput;
}
