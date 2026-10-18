import { getDb } from "../../../db";
import { hasDashboardAccess } from "../access";
import { handleWorkRecordMutation, removeWorkRecord, saveWorkRecord } from "../../features/calendar/work-record-service";

const mutate = (request: Request) => handleWorkRecordMutation(request, {
  authorize: hasDashboardAccess,
  save: record => saveWorkRecord(getDb(), record),
  remove: date => removeWorkRecord(getDb(), date),
});
export const PUT = mutate;
export const DELETE = mutate;
