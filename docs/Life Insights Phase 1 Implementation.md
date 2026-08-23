# Life Insights Phase 1 Implementation

## 范围

Phase 1 只增加四条派生记录：

1. 工作日与非工作日平均步数；
2. 工作日与非工作日平均锻炼时间；
3. 账单现金流结余；
4. 已保存工资记录趋势可用性。

不新增数据库、migration、独立 API、图表或 Data Center 模块。

## Domain 结构

`app/features/insights/types.ts` 定义统一 Contract；`domain.ts` 只接收现有领域结果并进行确定性派生，不查询或写入 D1。

Annual API 继续复用一次查询得到的 Health、Calendar、Salary 和 Life Finance 数据，在 `AnnualSummaryDraft` 中加法式返回 `insights`。由于 Annual 返回契约新增字段，计算版本由 `annual-summary-v2` 升为 `annual-summary-v3`；原领域字段和统计口径保持不变。

## Insight Contract

每条结果包含：

- `value` 与 `unit`；
- 实际计算 `period`；
- `availability`：available / partial / unavailable；
- 分组 coverage、cutoff 与原因；
- 自然语言 explanation；
- 可追溯 sources；
- actual / saved-snapshot / estimated / derived 类型。

不生成数字 confidence 或人生评分。

## Coverage 与 cutoff

- Health 复用 `resolveHealthMetricAvailability`：可信 present 与明确 0 进入分母，confirmed missing 不进入，早期记录保留兼容数值但结果至少为 partial。
- Health 工作日比较的最小样本固定为每组 3 天：任一组 0 天为 unavailable，任一组 1–2 天为 partial，两组均至少 3 天且全部可信时才为 available；包含早期记录时仍为 partial。
- Health × Calendar 只计算年初到 Annual `asOfDate`；Calendar 使用官方节假日、调休和个人修改后的最终 `workday`。
- Finance 直接使用现有 Life Finance 汇总中的收入与净消费；来源截止早于 Annual 日期时结果为 partial。
- Salary 只读取已保存快照；0 个月 unavailable，1 个月 partial，2 个月及以上比较首末实发快照；预计工资不参与。

## 禁止的推断

- Salary 与 Life Finance 不自动对账、合计或互相补齐；
- 账单现金流结余不称为储蓄、资产增长或财富增长；
- Health 差异只描述记录中的数值差异，不推断工作造成健康变化；
- 缺失记录不补零、不沿用相邻日期。

## UI

Annual Archive 新增轻量档案式区域“这一年，生活之间发生了什么”，最多四条文字记录；不新增 KPI 仪表盘或图表。数据不足时返回自然空状态，内部 coverage 术语不直接显示给用户。

## 本地预览

Annual Preview Fixture 继续保持 local-only 和纯合成数据。合成 Health 同时包含工作日、非工作日、明确零值、confirmed missing 与早期记录；Salary 包含两个月快照；Finance 包含收入、支出、退款、转账和还款。

## 数据库

No migration。
