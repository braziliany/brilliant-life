# Life Insights

状态：Phase 1 已在生产发布。

Life Insights 是纯函数派生层，不持久化、不新增 migration、不反写 Annual 或源领域。每条 insight 使用统一契约：`value`、`unit`、`period`、`coverage`、`availability` 与 `explanation`。

Phase 1 只包含：Health × Calendar 的工作日/非工作日对比、Life Finance 收支平衡、Salary 已保存快照趋势。样本不足时返回 partial 或 unavailable；不会将缺失当零值。

Health 最小样本：任一组 0 天为 unavailable；任一组 1–2 天为 partial；两组均至少 3 天且全部可信为 available；可计算但包含早期存在性未知记录为 partial。

禁止医疗判断、异常诊断、因果推断、未来预测、人生评分、Salary 与 Life Finance 自动对账，以及把派生结果保存为新事实。
