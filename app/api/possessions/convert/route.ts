import { getDb } from "../../../../db";
import { handlePossessions } from "../../../features/possessions/api";
import { createPossessionsStore } from "../../../features/possessions/store";
export const POST = (request: Request) => handlePossessions(request, "convert", () => createPossessionsStore(getDb()));
