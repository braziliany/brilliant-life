import { getDb } from "../../../../db";
import { handlePossessions } from "../../../features/possessions/api";
import { createPossessionsStore } from "../../../features/possessions/store";
const mutate = (request: Request) => handlePossessions(request, "uses", () => createPossessionsStore(getDb()));
export const POST = mutate;
export const PUT = mutate;
export const DELETE = mutate;
