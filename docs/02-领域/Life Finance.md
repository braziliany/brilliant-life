# Life Finance

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

## 截止与 Annual

Life Finance 的 `dateEnd` 是当前流水实际截止日期，不等于 Annual 的 `asOf`。Annual 同时保留两者；最后一个月份可能只是部分月份。

Salary 快照和 Life Finance 收入彼此独立，不自动匹配、相加或补齐。已发布真实数据的金额与记录数只保存在 v1.5 里程碑验收文档；领域层只要求固定回归基线存在。

## 交易核查

Life Finance 提供只读交易列表与来源核查详情，用于解释年度汇总由哪些记录构成：

- 列表按 `occurred_at DESC` 排列，同时间以来源身份稳定排序，并使用受限分页；
- 详情展示来源类型、来源记录 ID、原始分类、自动 Life Domain、可选人工覆盖和当前生效分类；
- 当前生效分类始终复用 `life_domain_override ?? life_domain`，与 Finance 聚合保持一致；
- API ViewModel 不暴露 dormant 的 Person / Project / Asset / Event / Place 关联字段，也不返回完整原始上传内容；
- 交易详情不允许修改金额、日期、类型、来源、来源分类或自动分类；只允许对当前交易设置或清除人工 Life Domain 覆盖。

交易核查不改变净消费、收入、退款、transfer 或 repayment 的统计口径，也不把 Salary 与流水关联。

### 信息架构与分页体验

Life Finance 主页面只承担年度概览：摘要、趋势、领域分布、重要支出、交易入口和数据管理。完整交易列表位于 `/finance/transactions` 二级页面；该页面统一承载年份选择、分页、交易详情与来源核查。

分页状态使用 `{ year, page }`：年份变化时页码重置为 1，同年份保持正常翻页。只有目标页请求成功且新列表完成渲染后，视口才回到交易列表顶部；打开或关闭交易详情不改变当前页码和滚动位置。交易详情继续通过唯一组件以 portal 挂载到 `document.body`，避免移动端 containing block 影响视口定位。

### Manual Life Domain Correction

人工修正继续叠加在来源事实和自动分类之上：

```text
source fact
  → automatic lifeDomain
  → optional lifeDomainOverride
  → effectiveLifeDomain = lifeDomainOverride ?? lifeDomain
```

- `PATCH /api/finance` 只接受交易数值 `id` 与 `lifeDomainOverride`；合法值复用正式 Life Domain 枚举，`null` 表示恢复自动分类；
- 相同值写入是无副作用 no-op，不更新 `updated_at`；数据库更新白名单只包含 `life_domain_override` 与服务端生成的 `updated_at`；
- 写接口继续受 Dashboard Access 保护，并要求生产精确 Origin 或同源本地开发 Origin；仅接受 JSON，不开放 CORS，也不允许 GET/query-string mutation；
- 重复导入、来源事实更新或自动分类规则变化时，`life_domain_override` 与 `semantic_note` 均保持；人工覆盖存在时始终优先于最新自动分类；
- 编辑入口只存在于交易详情，保存成功后同步更新当前列表行；来源核查、portal、分页与滚动状态保持不变；
- 发布和回归使用带日期的 production snapshot。人工分类修正前后，记录数、收入、总支出、退款和净消费必须保持；家庭、个人及 Life Domain 分布可以按修正金额发生数学一致的变化。历史 snapshot 只代表其记录日期，不应被当作需要回滚的永久数据库状态。
