import type { FinanceImportValidation, NormalizedFinanceTransaction } from "./types.ts";

const issueMessages = {
  invalid_structure: "无法读取钱迹文件结构",
  missing_required_header: "钱迹文件缺少必要表头",
  empty_id: "存在缺少账单 ID 的记录",
  duplicate_id: "存在重复账单 ID",
  invalid_date: "存在无法识别的交易时间",
  invalid_amount: "存在无法识别的金额",
  unsupported_type: "存在不支持的交易类型",
} as const;

export function trustedQianJiTransactions(validation: FinanceImportValidation): NormalizedFinanceTransaction[] {
  if (validation.valid) return validation.transactions;
  const firstIssue = validation.issues[0];
  throw new Error(firstIssue ? issueMessages[firstIssue.code] : "钱迹文件校验失败");
}

export function qianJiValidationSummary(validation: FinanceImportValidation) {
  return "钱迹文件有效 · " + validation.records + " 条 · " + validation.duplicateIds + " 个重复 ID · " + validation.invalidRecords + " 条无效记录";
}
