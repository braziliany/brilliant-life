export const ITEM_STATUSES = { in_use: "使用中", idle: "闲置", sold: "已出售", gifted: "已转赠", retired: "已淘汰" } as const;
export const WISH_STATUSES = { wanted: "想买", purchased: "已购买", cancelled: "取消" } as const;
export type ItemStatus = keyof typeof ITEM_STATUSES;
export type WishStatus = keyof typeof WISH_STATUSES;
export type ItemInput = {
  name: string; category: string; brandModel: string | null; purchaseDate: string | null;
  purchasePriceCents: number | null; notes: string; status: ItemStatus; endedDate: string | null;
};
export type WishInput = { name: string; budgetCents: number | null; plannedDate: string | null; notes: string; status: WishStatus };
export type UseInput = { itemId: number; usedOn: string; count: number; note: string };
export type Item = ItemInput & { id: number; sourceWishId: number | null; archivedAt: string | null; createdAt: string; updatedAt: string };
export type Wish = WishInput & { id: number; createdAt: string; updatedAt: string };
export type UseRecord = UseInput & { id: number; createdAt: string; updatedAt: string };
export type ItemMetrics = { holdingDays: number | null; recordedUses: number; perUseCents: number | null; perDayCents: number | null; throughDate: string | null };
export type ItemView = Item & { metrics: ItemMetrics };
export type Overview = { asOf: string; items: ItemView[]; wishes: Wish[] };
export type ItemDetail = { asOf: string; item: ItemView; uses: UseRecord[] };

export const shanghaiToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
}).format(now);
export const stoppedHolding = (status: ItemStatus) => status === "sold" || status === "gifted" || status === "retired";

// Purchase and exit days are included. Archiving only affects browsing, never ownership.
export function itemMetrics(item: Pick<Item, "purchaseDate" | "purchasePriceCents" | "status" | "endedDate">, recordedUses: number, asOf: string): ItemMetrics {
  const throughDate = stoppedHolding(item.status) ? item.endedDate && (item.endedDate < asOf ? item.endedDate : asOf) : asOf;
  const holdingDays = !item.purchaseDate || !throughDate || item.purchaseDate > throughDate ? null
    : Math.floor((Date.parse(`${throughDate}T00:00:00Z`) - Date.parse(`${item.purchaseDate}T00:00:00Z`)) / 86400000) + 1;
  return {
    holdingDays, recordedUses, throughDate,
    perUseCents: item.purchasePriceCents === null || recordedUses <= 0 ? null : item.purchasePriceCents / recordedUses,
    perDayCents: item.purchasePriceCents === null || !holdingDays ? null : item.purchasePriceCents / holdingDays,
  };
}

export const recordedUsesThrough = (uses: Pick<UseRecord, "usedOn" | "count">[], asOf: string) =>
  uses.filter(use => use.usedOn <= asOf).reduce((sum, use) => sum + use.count, 0);
export const formatCost = (cents: number | null) => cents === null ? "不可计算" : `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// UI yuan strings are converted exactly to integer cents. Blank remains unknown.
export function yuanToCents(value: string): number | null {
  if (value.trim() === "") return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error("金额请填写非负数，最多两位小数。");
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("金额过大。");
  return Number(cents);
}
