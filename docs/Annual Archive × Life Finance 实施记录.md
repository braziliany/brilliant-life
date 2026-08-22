# Annual Archive × Life Finance 实施记录

日期：2026-08-22
状态：待实机验收，未提交、未推送、未部署

## 目标

将已有 Life Finance 账单汇总接入“我的 2026”，同时保持工资快照与实际账单两个来源独立。年度页面回答“钱主要从哪里来，又花在了哪里”，但不自动对账、不补齐收入，也不把工资快照转换成账单。

## 领域与数据流

年度 Finance 结构调整为：

```text
finance
├─ salary       已保存工资快照
└─ lifeFinance  实际财务流水
```

Annual API 只读查询目标年份的 `finance_transactions`，映射为现有 Finance record 后交给 Annual domain。Annual domain 再按上海自然日的年度 `asOf` 截止，并复用 `summarizeLifeFinance` 的收入、支出、退款、净消费与 Life Domain 口径。没有新增数据库表、migration 或重复会计算法。

Annual Life Finance 输出：记录数、起止日期、收入、原始支出、退款、净消费、家庭支出、个人消费、逐月净消费、分类分布、最多 5 条重要支出，以及独立 coverage、sources 和 warnings。

## 页面

- 工资记录与生活收支以两个来源卡分别展示，并明确“不自动合计”。
- 生活收支显示今年收入、净消费、家庭支出与个人消费。
- 月度趋势采用 Lieflat Basics F1 Rung Bars，保持月份顺序；财务截止月份明确显示实际截止日期。
- 分类分布采用 Lieflat Basics F5 Tick Rows，沿用现有 Porcelain 色系和 Life Domain 分类。
- 重要支出最多展示 5 条，仅保留日期、自然标题、分类和金额；不向页面输出来源 ID、账户、导入文件或其他溯源字段。
- Salary 与 Life Finance 各自有空状态；一方没有记录不会隐藏另一方。

## 数据与隐私边界

- Salary 仍只读取已保存快照，Life Finance 仍只读取账单记录。
- transfer / repayment、退款抵扣和分类口径全部复用 Finance domain。
- 不自动合并两类收入，不推断漏记收入，不做收支平衡。
- 测试使用 1,035 条完全合成记录固定统计基线，不含真实备注、账户、sourceId 或导入文件内容。
- 远端 D1 仅执行只读聚合复核，`rows_written = 0`。

## 验证

- 远端只读基线：1,035 条，2026-01-01 至 2026-08-11；收入 4,335,928 分、原始支出 3,408,721 分、退款 90,820 分。
- 新增 6 项 Annual × Life Finance 测试，覆盖统计基线、来源隔离、四种空状态、YTD 边界、重要支出脱敏和历史全年语义。
- Annual 页面契约 6/6、全部领域/API/UI 测试 106/106、迁移测试 2/2 和本地 Worker 渲染测试 1/1 通过。
- 生产构建与 `git diff --check` 通过。自动化视觉浏览器无法稳定连接 Wrangler 远程预览；Desktop 与 375 px 真机视觉仍待用户在本地预览中确认，未虚报通过。

## 未改变

数据库、migration、Finance accounting、Salary 公式、Health、Calendar、Career、导入与幂等逻辑均未改变。本轮不发布 Worker。
