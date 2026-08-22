# Annual Finance 数据来源说明

Annual Finance 包含两套彼此独立的记录：

## 工资记录

- 来源表：`salary_records`
- 含义：用户明确保存的月度工资快照
- 年度统计：保存月份、应发、个税、实发
- 边界：历史快照不按当前公式重新计算

## 生活收支

- 来源表：`finance_transactions`
- 当前来源：钱迹导入（内部 `source = qianji`）
- 含义：实际账单中的收入、支出、退款及 Life Domain 分类
- 年度统计：复用 Finance domain 的 `summarizeLifeFinance`
- 口径：`净消费 = 支出 - 退款`；转账和还款不计消费
- 边界：按目标自然年筛选；当前年度同时受 Annual `asOf` 截止

## 两套来源的关系

工资快照不会转换成财务交易，财务交易中的收入也不会自动解释成工资。Annual Archive 不将二者相加为“全年总收入”，不自动对账、不推断漏记收入，也不互相补齐。

## Coverage 与截止日期

- Salary coverage：截至 Annual `asOf` 的已到月份中，存在多少个月度工资快照。
- Life Finance coverage：目标年份内实际出现交易记录的月份数及起止日期。
- Annual `asOf` 与 Life Finance `dateEnd` 分别保存；财务来源较早截止时，页面同时显示两个日期。
- Life Finance 的最后一个月份可以是部分月份，不能据此宣称全年或整月完整。

## 页面隐私

年度重要支出只输出日期、截短后的自然标题、分类和金额。来源 ID、账户、导入文件、完整原始备注与私密标签不进入 Annual ViewModel。
