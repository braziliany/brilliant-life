# Life Finance / 生命财务

## 产品定位

钱迹负责记录钱发生了什么；璀璨人生负责把这些记录放进个人生活时间线，理解资源流向家庭、饮食、数字生活、设备、兴趣、健康、学习等方向。本模块不是钱迹替代品，不提供手工记账、预算、信用卡账务或投资管理。

## 架构

```text
External Finance Source
  → FinanceSourceAdapter
  → NormalizedFinanceTransaction
  → Incremental Import
  → finance_transactions
  → Finance Domain
  → Life Finance UI
```

当前适配器：

- `QianJiJsonAdapter`：推荐导入方式；接受数组或 `transactions/records/bills/data/list` 容器。
- `QianJiExcelAdapter`：兼容钱迹 `.xlsx` 导出；按表头名称读取，不依赖固定列位置。

未来若钱迹开放官方查询 API，只新增 `QianJiApiAdapter`，其余模型、统计和 UI 无需重写。

## 数据模型

`finance_transactions` 使用 `(source, source_id)` 唯一约束。金额统一保存为整数分，避免 JavaScript 浮点误差。

Source Layer 保存来源类型、分类、账户、备注和标签；Life Layer 保存生命领域、语义说明以及 Person / Project / Asset / Event / Place 的可空关联。

工资与流水是不同记录：

- `SalaryRecord`：工资结构、应发、个税、实发。
- `FinanceTransaction`：实际发生的资金流水。

本轮不强制关联二者。

## 增量同步与安全更新

当前流程：

```text
Manual Export → Upload → Incremental Import
```

同一 `(source, source_id)`：

- 不变：跳过；
- 来源字段变化：更新；
- 新记录：新增。

更新只覆盖来源字段和系统分类，不覆盖 `life_domain_override`、Person、Project、Asset、Event、Place 或人工语义说明。导入不会因源文件缺少记录而删除本地数据。

## 统计口径

- 净消费 = expense − refund。
- 收入 = income。
- transfer 与 repayment 不计入消费。
- 年度、月度、生命领域和重要支出均由 finance domain 统一计算，UI 不重复实现。
- 重要支出初始阈值为 ¥500，可由 domain 调用方配置。

## Life Domain

初始领域：家庭、饮食、数字生活、数码设备、兴趣娱乐、日常生活、交通、衣着美容、健康、学习、其他。

钱迹分类仅作为初始输入；人工覆盖保存在独立字段，后续重新导入不会丢失。

## 导入与数据安全

网页导入入口支持钱迹 JSON 与 Excel，并反馈读取、新增、更新、已存在和失败数量。文件只在浏览器内解析，标准化记录分批发送；服务器不保存原始上传文件。

Git 忽略：`data/private/`、`imports/`、`*.private.xlsx`、`*.private.json`。测试只包含最小脱敏 fixture，不含真实账户、银行卡或真实账单。

## 未来工作

- QianJiApiAdapter 与定时同步；
- Person / Project / Asset / Event / Place 实际关联 UI；
- 跨来源重复匹配；
- AI 语义分类和年度叙事；
- 长期生活方式趋势。
