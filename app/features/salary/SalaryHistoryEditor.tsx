import type { SalaryRecordInput } from "../../page-view.types";

type Props = {
  mode: "create" | "edit";
  draft: SalaryRecordInput;
  status: "idle" | "saving" | "error";
  error: string;
  onChange: (field: keyof SalaryRecordInput, value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

const fields: Array<{ key: Exclude<keyof SalaryRecordInput, "month">; label: string; step: string; max?: number }> = [
  { key: "workdays", label: "工作日", step: "1", max: 31 },
  { key: "dailyRate", label: "日薪", step: "0.01" },
  { key: "extraIncome", label: "额外收入", step: "0.01" },
  { key: "bonus", label: "奖金", step: "0.01" },
  { key: "deductions", label: "固定扣除", step: "0.01" },
  { key: "leaveDeduction", label: "请假扣款", step: "0.01" },
  { key: "taxThreshold", label: "起征点", step: "0.01" },
  { key: "taxRate", label: "税率 (%)", step: "0.01", max: 100 },
];

export function SalaryHistoryEditor({ mode, draft, status, error, onChange, onCancel, onSubmit }: Props) {
  const saving = status === "saving";
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(draft.month) && fields.every(({ key, max }) => {
    const value = draft[key];
    return Number.isFinite(value) && value >= 0 && (key !== "workdays" || Number.isInteger(value)) && (max === undefined || value <= max);
  });

  return (
    <section className={`salaryHistoryEditor${status === "error" ? " error" : ""}`} aria-label={mode === "edit" ? `编辑 ${draft.month} 工资记录` : "补录工资月份"}>
      <div className="salaryEditorHead">
        <div><span>{mode === "edit" ? "历史纠正" : "补录历史"}</span><h4>{mode === "edit" ? `${draft.month.replace("-", " 年 ")} 月` : "补录工资月份"}</h4></div>
        <button type="button" onClick={onCancel} disabled={saving}>取消</button>
      </div>
      <div className="salaryEditorFields">
        <label><span>月份</span><input type="month" value={draft.month} readOnly={mode === "edit"} onChange={(event) => onChange("month", event.target.value)} /></label>
        {fields.map(({ key, label, step, max }) => (
          <label key={key}><span>{label}</span><input type="number" min="0" max={max} step={step} value={draft[key]} onChange={(event) => onChange(key, event.target.value)} /></label>
        ))}
      </div>
      <div className="salaryEditorActions">
        <p aria-live="polite">{status === "error" ? error : mode === "edit" ? "保存后只更新这个月份。" : "确认保存后才会成为历史工资记录。"}</p>
        <button type="button" onClick={onSubmit} disabled={!valid || saving}>{saving ? "保存中…" : mode === "edit" ? "保存修改" : "保存补录"}</button>
      </div>
    </section>
  );
}
