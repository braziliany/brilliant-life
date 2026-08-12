import { strFromU8, unzipSync } from "fflate";
import type { FinanceSourceAdapter, NormalizedFinanceTransaction } from "../types.ts";
import { normalizeQianJiRow } from "./shared.ts";

const decodeXml = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const columnIndex = (reference: string) => [...reference.replace(/\d/g, "")].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;

function sharedStrings(xml = "") {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => decodeXml([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")));
}

function excelDate(serial: number) {
  const base = Date.UTC(1899, 11, 30);
  return new Date(base + serial * 86_400_000);
}

function sheetRows(xml: string, strings: string[]) {
  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const values: unknown[] = [];
    for (const cell of rowMatch[1].matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = cell[1].match(/r="([A-Z]+\d+)"/)?.[1];
      if (!reference) continue;
      const type = cell[1].match(/t="([^"]+)"/)?.[1];
      const raw = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? cell[2].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      values[columnIndex(reference)] = type === "s" ? strings[Number(raw)] ?? "" : type === "inlineStr" || type === "str" ? decodeXml(raw) : raw === "" ? "" : Number.isFinite(Number(raw)) ? Number(raw) : decodeXml(raw);
    }
    return values;
  });
}

export class QianJiExcelAdapter implements FinanceSourceAdapter<ArrayBuffer | Uint8Array> {
  readonly source = "qianji";

  async parse(input: ArrayBuffer | Uint8Array): Promise<NormalizedFinanceTransaction[]> {
    const files = unzipSync(input instanceof Uint8Array ? input : new Uint8Array(input));
    const strings = sharedStrings(files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "");
    const sheet = files["xl/worksheets/sheet1.xml"];
    if (!sheet) throw new Error("Excel 中没有可读取的第一个工作表");
    const rows = sheetRows(strFromU8(sheet), strings);
    const headers = rows.shift()?.map((value) => String(value ?? "").trim()) ?? [];
    return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, header.includes("时间") && typeof values[index] === "number" ? excelDate(values[index] as number) : values[index]]))).map(normalizeQianJiRow).filter((item): item is NormalizedFinanceTransaction => item !== null);
  }
}
