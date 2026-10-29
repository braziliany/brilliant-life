import type { ItemInput, WishInput, UseInput } from "./domain.ts";

// Read models contain server-owned metadata and derived metrics. Never spread
// them into a write request, even when TypeScript accepts structural subtypes.
export function itemPayload(value: ItemInput): ItemInput {
  return { name: value.name, category: value.category, brandModel: value.brandModel,
    purchaseDate: value.purchaseDate, purchasePriceCents: value.purchasePriceCents,
    notes: value.notes, status: value.status, endedDate: value.endedDate };
}

export function wishPayload(value: WishInput): WishInput {
  return { name: value.name, budgetCents: value.budgetCents, plannedDate: value.plannedDate,
    notes: value.notes, status: value.status };
}

export function usePayload(value: UseInput): UseInput {
  return { itemId: value.itemId, usedOn: value.usedOn, count: value.count, note: value.note };
}
