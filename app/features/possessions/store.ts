import { and, desc, eq, lte, sql } from "drizzle-orm";
import { possessionItems as items, possessionUses as uses, possessionWishes as wishes } from "../../../db/schema.ts";
import { itemMetrics, recordedUsesThrough, type ItemInput, type UseInput, type WishInput } from "./domain.ts";

type Db = ReturnType<typeof import("../../../db/index.ts").getDb>;
export class PossessionsError extends Error {
  readonly status: number;
  constructor(message: string, status = 404) { super(message); this.status = status; }
}
export function createPossessionsStore(db: Db) {
  const item = async (id: number) => {
    const [row] = await db.select().from(items).where(eq(items.id, id));
    if (!row) throw new PossessionsError("物品不存在。");
    return row;
  };
  return {
    async overview(asOf: string) {
      const [rows, wishRows, counts] = await Promise.all([
        db.select().from(items).orderBy(desc(items.updatedAt), desc(items.id)),
        db.select().from(wishes).orderBy(desc(wishes.id)),
        db.select({ itemId: uses.itemId, count: sql<number>`sum(${uses.count})` }).from(uses).where(lte(uses.usedOn, asOf)).groupBy(uses.itemId),
      ]);
      const totals = new Map(counts.map(row => [row.itemId, row.count]));
      return { asOf, items: rows.map(row => ({ ...row, metrics: itemMetrics(row, totals.get(row.id) ?? 0, asOf) })), wishes: wishRows };
    },
    async detail(id: number, asOf: string) {
      const row = await item(id);
      const records = await db.select().from(uses).where(eq(uses.itemId, id)).orderBy(desc(uses.usedOn), desc(uses.id));
      return { asOf, item: { ...row, metrics: itemMetrics(row, recordedUsesThrough(records, asOf), asOf) }, uses: records };
    },
    async saveItem(value: ItemInput, id?: number) {
      if (id !== undefined) {
        const [row] = await db.update(items).set({ ...value, updatedAt: new Date().toISOString() }).where(eq(items.id, id)).returning();
        if (!row) throw new PossessionsError("物品不存在。");
        return row;
      }
      return (await db.insert(items).values(value).returning())[0];
    },
    async archive(id: number, archived: boolean) {
      const [row] = await db.update(items).set({ archivedAt: archived ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }).where(eq(items.id, id)).returning();
      if (!row) throw new PossessionsError("物品不存在。");
      return row;
    },
    async saveWish(value: WishInput, id?: number) {
      if (id === undefined) return (await db.insert(wishes).values(value).returning())[0];
      // A converted wish remains purchased. The source relation cannot be cancelled by a racing edit.
      const [row] = await db.update(wishes).set({ ...value, updatedAt: new Date().toISOString() }).where(and(eq(wishes.id, id),
        sql`(${value.status} = 'purchased' OR NOT EXISTS (SELECT 1 FROM possession_items WHERE source_wish_id = ${id}))`)).returning();
      if (row) return row;
      const [exists] = await db.select().from(wishes).where(eq(wishes.id, id));
      throw new PossessionsError(exists ? "已转入的愿望必须保留已购买状态。" : "愿望不存在。", exists ? 409 : 404);
    },
    async convert(wishId: number, value: ItemInput) {
      const [wish] = await db.select().from(wishes).where(eq(wishes.id, wishId));
      if (!wish) throw new PossessionsError("愿望不存在。");
      if (wish.status !== "purchased") throw new PossessionsError("请先将愿望标记为已购买。", 409);
      // One conditional statement and a unique FK prevent duplicate conversion, including concurrent requests.
      const rows = await db.all<{ id: number }>(sql`INSERT INTO possession_items
        (name,category,brand_model,purchase_date,purchase_price_cents,notes,status,ended_date,source_wish_id)
        SELECT ${value.name},${value.category},${value.brandModel},${value.purchaseDate},${value.purchasePriceCents},${value.notes},${value.status},${value.endedDate},${wishId}
        FROM possession_wishes WHERE id=${wishId} AND status='purchased'
        AND NOT EXISTS (SELECT 1 FROM possession_items WHERE source_wish_id=${wishId}) RETURNING id`);
      if (!rows[0]) throw new PossessionsError("该愿望已转入物品，或状态已变化，请重新读取。", 409);
      return item(rows[0].id);
    },
    async saveUse(value: UseInput, id?: number) {
      await item(value.itemId);
      if (id === undefined) return (await db.insert(uses).values(value).returning())[0];
      const [row] = await db.update(uses).set({ usedOn: value.usedOn, count: value.count, note: value.note, updatedAt: new Date().toISOString() })
        .where(and(eq(uses.id, id), eq(uses.itemId, value.itemId))).returning();
      if (!row) throw new PossessionsError("使用记录不存在或不属于此物品。");
      return row;
    },
    async removeUse(id: number, itemId: number) {
      const [row] = await db.delete(uses).where(and(eq(uses.id, id), eq(uses.itemId, itemId))).returning();
      if (!row) throw new PossessionsError("使用记录不存在或不属于此物品。");
      return { deleted: id };
    },
  };
}
