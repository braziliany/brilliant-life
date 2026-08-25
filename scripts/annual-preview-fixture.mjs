export const PREVIEW_SOURCE = "annual-preview-synthetic";
export const PREVIEW_YEAR = 2026;
export const PREVIEW_AS_OF = "2026-08-22";

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const nullable = (value) => value === null ? "NULL" : quote(value);

export const healthRows = [
  ["2026-01-12", 7200, 420, 1540, 28, 1, 68.4, 438, 62, ["steps", "activeEnergyKcal", "restingEnergyKcal", "exerciseMinutes", "workoutCount", "weightKg", "sleepMinutes", "restingHeartRateBpm"]],
  ["2026-02-15", 8100, 465, 1580, 34, 1, 68.1, 421, 61, null],
  ["2026-03-20", 9300, 510, 1605, 42, 2, null, 452, null, ["steps", "activeEnergyKcal", "restingEnergyKcal", "exerciseMinutes", "workoutCount", "sleepMinutes"]],
  ["2026-04-12", 0, 0, 1495, 0, 0, 67.8, null, 64, ["steps", "activeEnergyKcal", "restingEnergyKcal", "exerciseMinutes", "workoutCount", "weightKg", "restingHeartRateBpm"]],
  ["2026-05-18", 0, 0, 0, 0, 0, null, null, null, []],
  ["2026-06-21", 10450, 575, 1640, 48, 2, 67.5, 410, 60, ["steps", "activeEnergyKcal", "restingEnergyKcal", "exerciseMinutes", "workoutCount", "weightKg", "sleepMinutes", "restingHeartRateBpm"]],
  ["2026-07-14", 6850, 390, 1510, 22, 1, 67.3, 467, 63, ["steps", "activeEnergyKcal", "restingEnergyKcal", "exerciseMinutes", "workoutCount", "weightKg", "sleepMinutes", "restingHeartRateBpm"]],
  ["2026-08-16", 11200, 630, 1660, 55, 2, 67.0, 445, 59, ["steps", "activeEnergyKcal", "restingEnergyKcal", "exerciseMinutes", "workoutCount", "weightKg", "sleepMinutes", "restingHeartRateBpm"]],
];

export const salaryRows = [
  ["2026-06", 21, 320, 180, 6720, 1540, 46.2, 6493.8, 0, 0, 0],
  ["2026-07", 23, 320, 180, 7360, 2180, 65.4, 7114.6, 0, 0, 0],
];

export const careerRows = [
  ["北辰实验室", "资料整理员", "2025-09", "2026-03", "合成年档案中的上一段经历", 1],
  ["远航创意工坊", "项目协调员", "2026-04", null, "合成年档案中的当前职位", 2],
];

export const financeRows = [
  ["01-income", "2026-01-08T09:00:00+08:00", "income", 620000, "合成收入", "other", "一月合成收入"],
  ["01-food", "2026-01-16T18:20:00+08:00", "expense", 38600, "三餐", "food", "一月饮食"],
  ["02-device", "2026-02-12T14:00:00+08:00", "expense", 128800, "电器数码", "device", "测试显示器"],
  ["02-refund", "2026-02-18T11:00:00+08:00", "refund", 18800, "电器数码", "device", "测试退款"],
  ["03-income", "2026-03-07T09:00:00+08:00", "income", 640000, "合成收入", "other", "三月合成收入"],
  ["03-family", "2026-03-19T20:00:00+08:00", "expense", 96000, "其它", "other", "家庭用品", "family"],
  ["03-transfer", "2026-03-25T10:00:00+08:00", "transfer", 200000, "账户转账", "other", "账户间转账"],
  ["04-learning", "2026-04-09T19:00:00+08:00", "expense", 76000, "学习", "learning", "虚构课程"],
  ["04-food", "2026-04-21T12:30:00+08:00", "expense", 42500, "三餐", "food", "四月饮食"],
  ["05-income", "2026-05-06T09:00:00+08:00", "income", 665000, "合成收入", "other", "五月合成收入"],
  ["05-digital", "2026-05-15T08:00:00+08:00", "expense", 58800, "软件订阅", "digital", "虚构订阅"],
  ["05-repayment", "2026-05-27T16:00:00+08:00", "repayment", 120000, "还款", "other", "合成还款"],
  ["06-health", "2026-06-10T15:00:00+08:00", "expense", 68000, "医疗", "health", "常规检查"],
  ["06-family", "2026-06-23T17:30:00+08:00", "expense", 110000, "家庭", "family", "家庭活动"],
  ["07-income", "2026-07-05T09:00:00+08:00", "income", 680000, "合成收入", "other", "七月合成收入"],
  ["07-transport", "2026-07-11T07:40:00+08:00", "expense", 53500, "交通", "transport", "合成长途交通"],
  ["07-daily", "2026-07-24T20:10:00+08:00", "expense", 47200, "日用品", "daily_life", "七月日用品"],
  ["08-entertainment", "2026-08-06T19:20:00+08:00", "expense", 82000, "文化休闲", "entertainment", "虚构展览"],
  ["08-food", "2026-08-12T12:10:00+08:00", "expense", 36100, "三餐", "food", "八月饮食"],
  ["08-family", "2026-08-18T18:00:00+08:00", "expense", 145000, "家庭", "family", "合成家庭支出"],
  ["08-daily", "2026-08-20T10:30:00+08:00", "expense", 15900, "日用品", "daily_life", "八月日用品"],
];

export function buildSeedSql() {
  const statements = [];
  for (const [date, steps, active, resting, exercise, workouts, weight, sleep, heartRate, coverage] of healthRows) {
    statements.push(`INSERT INTO health_daily (date, steps, active_energy_kcal, resting_energy_kcal, exercise_minutes, workout_count, weight_kg, sleep_minutes, resting_heart_rate_bpm, metric_coverage, source, updated_at) VALUES (${quote(date)}, ${steps}, ${active}, ${resting}, ${exercise}, ${workouts}, ${weight ?? "NULL"}, ${sleep ?? "NULL"}, ${heartRate ?? "NULL"}, ${coverage === null ? "NULL" : quote(JSON.stringify(coverage))}, ${quote(PREVIEW_SOURCE)}, ${quote(`${PREVIEW_AS_OF}T12:00:00.000Z`)});`);
  }
  for (const [month, workdays, dailyRate, deductions, gross, taxable, tax, net, extra, bonus, leave] of salaryRows) {
    statements.push(`INSERT INTO salary_records (month, workdays, daily_rate, deductions, tax_threshold, tax_rate, extra_income, bonus, leave_deduction, gross_salary, taxable_income, income_tax, net_salary, updated_at) VALUES (${quote(month)}, ${workdays}, ${dailyRate}, ${deductions}, 5000, 3, ${extra}, ${bonus}, ${leave}, ${gross}, ${taxable}, ${tax}, ${net}, ${quote(`${PREVIEW_AS_OF}T12:00:00.000Z`)});`);
  }
  for (const [company, role, start, end, summary, order] of careerRows) {
    statements.push(`INSERT INTO work_experiences (company, role, start_date, end_date, summary, sort_order, updated_at) VALUES (${quote(company)}, ${quote(role)}, ${quote(start)}, ${nullable(end)}, ${quote(summary)}, ${order}, ${quote(`${PREVIEW_AS_OF}T12:00:00.000Z`)});`);
  }
  for (const [sourceId, occurredAt, type, amount, category, domain, note, domainOverride = null] of financeRows) {
    statements.push(`INSERT INTO finance_transactions (source, source_id, occurred_at, type, amount_cents, currency, raw_type, raw_category, note, tags, life_domain, life_domain_override, semantic_note, created_at, updated_at) VALUES (${quote(PREVIEW_SOURCE)}, ${quote(sourceId)}, ${quote(occurredAt)}, ${quote(type)}, ${amount}, 'CNY', ${quote(type)}, ${quote(category)}, ${quote(note)}, '[]', ${quote(domain)}, ${nullable(domainOverride)}, '纯合成本地预览记录', ${quote(`${PREVIEW_AS_OF}T12:00:00.000Z`)}, ${quote(`${PREVIEW_AS_OF}T12:00:00.000Z`)});`);
  }
  return `${statements.join("\n")}\n`;
}

export function buildResetSql() {
  return [
    `DELETE FROM finance_transactions WHERE source = ${quote(PREVIEW_SOURCE)};`,
    `DELETE FROM health_daily WHERE source = ${quote(PREVIEW_SOURCE)};`,
    `DELETE FROM salary_records WHERE month IN (${salaryRows.map(([month]) => quote(month)).join(", ")});`,
    `DELETE FROM work_experiences WHERE company IN (${careerRows.map(([company]) => quote(company)).join(", ")});`,
  ].join("\n") + "\n";
}

export const expectedCounts = {
  health: healthRows.length,
  salary: salaryRows.length,
  career: careerRows.length,
  finance: financeRows.length,
};
