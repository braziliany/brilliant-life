# Calendar

工作日历由年份化官方配置和 D1 个人覆盖组成。官方配置记录法定休假、调休上班及名称；当前已配置年份由 `holiday-data` 明确提供，未配置年份不得假装拥有官方节假日信息。

解析优先级：个人覆盖 → 官方法定休假/调休 → 普通周一至周五/周末。备注不改变日期状态，也不自动换算工资扣款。

Calendar domain 负责日期键、月历结构、状态解析、月份切换、月度/年度工作日统计。Salary 只消费解析后的工作日数量，不拥有日历规则。

当前年度 Annual 的工作时间事实只统计 `asOf` 之前已经发生的日期；全年配置可以另行展示，但必须标明其中包含未来日期。

## Calendar Widget Current Truth

- Phase 1 只读端点为 `GET /api/v1/calendar/widget`，只允许上海时区当前月份及相邻月份。
- Widget 直接复用 Calendar domain 的日期解析、官方节假日配置和个人覆盖；不维护第二份节假日或工作日真相源。
- 返回范围只包含月度日期状态、个人覆盖标记和备注存在性摘要，不返回备注正文、其他生活领域或内部记录标识。
- Widget 不提供 mutation endpoint；POST、PUT、PATCH、DELETE 均拒绝，Phase 1 无 migration、无 D1 写入。
- Widget 使用独立、path-scoped 的 Cloudflare Access Application 与 Calendar Service Token；该 token 不能进入 Health Ingest、Dashboard 或其他 private read 路由。
