import { getDb } from "../../../db";
import { handlePossessions } from "../../features/possessions/api";
import { createPossessionsStore } from "../../features/possessions/store";
export const GET = (request: Request) => handlePossessions(request, "overview", () => createPossessionsStore(getDb()));
