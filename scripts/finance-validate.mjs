import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { QianJiExcelAdapter } from "../app/features/finance/adapters/qianji-excel.ts";
import { QianJiJsonAdapter } from "../app/features/finance/adapters/qianji-json.ts";
import { qianJiValidationSummary } from "../app/features/finance/trusted-import.ts";

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const file = fileIndex >= 0 ? args[fileIndex + 1] : undefined;
if (!file) {
  console.error("Usage: npm run finance:validate -- --file <qianji.xlsx|qianji.json>");
  process.exitCode = 1;
} else {
  const path = resolve(file);
  const extension = extname(path).toLowerCase();
  if (extension !== ".xlsx" && extension !== ".json") {
    console.error("QianJi file invalid: supported formats are XLSX and JSON");
    process.exitCode = 1;
  } else {
    const bytes = await readFile(path);
    const validation = extension === ".xlsx"
      ? await new QianJiExcelAdapter().inspect(bytes)
      : await new QianJiJsonAdapter().inspect(bytes.toString("utf8"));
    if (!validation.valid) {
      console.error("QianJi file invalid\n" + validation.records + " records\n" + validation.duplicateIds + " duplicate IDs\n" + validation.invalidRecords + " invalid records");
      process.exitCode = 1;
    } else {
      console.log(qianJiValidationSummary(validation));
    }
  }
}
