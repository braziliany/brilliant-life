import { hasDashboardAccess, hasDashboardMutationOrigin } from "../../api/access.ts";
import { shanghaiToday } from "./domain.ts";
import { objectOnly, parseItem, parseUse, parseWish, validId, ITEM_KEYS, WISH_KEYS } from "./validation.ts";
import { PossessionsError, type createPossessionsStore } from "./store.ts";

type Store = ReturnType<typeof createPossessionsStore>;
export type Resource = "overview" | "items" | "wishes" | "uses" | "convert";
const headers = { "Cache-Control": "no-store" };
const methods = { overview: ["GET"], items: ["POST", "PUT", "PATCH"], wishes: ["POST", "PUT"], uses: ["POST", "PUT", "DELETE"], convert: ["POST"] };

export async function handlePossessions(request: Request, resource: Resource, getStore: () => Store, today = shanghaiToday()) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!hasDashboardAccess(request)) return json({ error: "Cloudflare Access login required" }, 401);
  if (!methods[resource].includes(request.method)) return new Response(null, { status: 405, headers: { ...headers, Allow: methods[resource].join(", ") } });
  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      if ([...url.searchParams.keys()].some(key => key !== "itemId")) return json({ error: "Invalid query" }, 400);
      const raw = url.searchParams.get("itemId");
      if (raw !== null && (!/^[1-9]\d*$/.test(raw) || !validId(Number(raw)) || url.searchParams.getAll("itemId").length !== 1)) return json({ error: "Invalid itemId" }, 400);
      const store = getStore();
      return json(raw === null ? await store.overview(today) : await store.detail(Number(raw), today));
    }
    if (!hasDashboardMutationOrigin(request)) return json({ error: "Invalid origin" }, 403);
    if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return json({ error: "JSON required" }, 415);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const invalid = () => json({ error: "输入无效，请检查名称、金额、日期和状态。停止持有需填写真实结束日期。" }, 400);
    if (resource === "convert") {
      if (!objectOnly(body, ["wishId", "item"]) || !validId(body.wishId)) return invalid();
      const value = parseItem(body.item, today);
      if (!value) return invalid();
      return json({ item: await getStore().convert(body.wishId, value) }, 201);
    }
    if (request.method === "PATCH") {
      if (!objectOnly(body, ["id", "archived"]) || !validId(body.id) || typeof body.archived !== "boolean") return invalid();
      return json({ item: await getStore().archive(body.id, body.archived) });
    }
    if (request.method === "DELETE") {
      if (!objectOnly(body, ["id", "itemId"]) || !validId(body.id) || !validId(body.itemId)) return invalid();
      return json(await getStore().removeUse(body.id, body.itemId));
    }
    const keys = resource === "items" ? ITEM_KEYS : resource === "wishes" ? WISH_KEYS : ["itemId", "usedOn", "count", "note"];
    const editing = request.method === "PUT";
    if (!objectOnly(body, editing ? [...keys, "id"] : keys)) return invalid();
    const { id, ...payload } = body;
    if (editing && !validId(id)) return invalid();
    const value = resource === "items" ? parseItem(payload, today) : resource === "wishes" ? parseWish(payload) : parseUse(payload, today);
    if (!value) return invalid();
    const store = getStore();
    const saved = resource === "items" ? await store.saveItem(value as ReturnType<typeof parseItem> & {}, id as number | undefined)
      : resource === "wishes" ? await store.saveWish(value as ReturnType<typeof parseWish> & {}, id as number | undefined)
      : await store.saveUse(value as ReturnType<typeof parseUse> & {}, id as number | undefined);
    return json({ record: saved }, editing ? 200 : 201);
  } catch (error) {
    if (error instanceof PossessionsError) return json({ error: error.message }, error.status);
    return json({ error: "物品档案暂时无法读取或保存，请重试。" }, 500);
  }
}
