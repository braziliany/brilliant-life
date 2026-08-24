# Annual Archive

Annual Archive 是跨领域只读模型。输入为目标年份、当前 `asOf` 以及 Health、Calendar、Career、Salary、Life Finance 的领域结果；它不写数据库，不修改源记录。

## 时间语义

- 当前年度：YTD，只陈述 `asOf` 之前发生的记录。
- 历史年度：可按完整自然年汇总。
- Calendar 全年配置与已发生工作日分开表达。
- Life Finance 保留自身 `dateEnd`，不能用 Annual `asOf` 冒充来源已更新到同一天。

## 来源与覆盖

每个分区保留独立 sources、coverage、warnings 和空状态。Salary 与 Life Finance 在 Finance 下分区展示且不自动合计。Health 区分可信、早期和明确缺失。当前年度页面是实时只读视图，不是冻结档案；冻结/导出需另行立项。
