# Health Ingest Hardening

## 状态

验收通过。2026-08-22 已执行远端 D1 migration；应用代码待正式发布。

## 数据语义

`health_daily.metric_coverage` 是日期级指标存在性记录：

- `NULL`：旧记录，指标存在性未知；
- `[]`：新协议已处理该日期，但没有有效指标；
- 包含指标键：该指标由上游明确提供，数值 `0` 可以作为真实零值；
- 不包含指标键：该指标缺失。

同一天多次导入时 coverage 取并集。只有本次 payload 明确提供且有效的指标才更新数值；缺失、`null`、空字符串、空白字符串和非法数字不覆盖旧值。

## 解析规则

统一 Optional Number Parser：

- `undefined`、`null`、空字符串、纯空白、非法字符串、`NaN`、`Infinity` → absent；
- `0`、`"0"` → present zero；
- 有限 number、numeric string → present value。

日期字符串 `YYYY-MM-DD` 原样保留；带时区的 timestamp 统一换算到 `Asia/Shanghai` 自然日。

`workouts` 缺失时 `workoutCount` 缺失；明确空数组时为 `0`；包含可归属日期的 workout rows 时按上海自然日计数。本轮不保存训练详情。

## 历史与年度统计

禁止根据历史数字推断 coverage，禁止修改历史 `0`。新协议记录只有 coverage 明确包含指标时才进入该指标统计；明确缺失不进入，显式零值正常进入。

`metric_coverage = NULL` 的早期记录继续按升级前既有规则参与历史数值统计，避免 migration 后年度 Health 突然清空；但同时单独报告可信指标天数、早期记录天数和明确缺失天数，早期记录不计入可信 coverage。后续同日真实 ingest 只会用 payload 明确包含的指标渐进补充 coverage，不设专门回填算法。

## Migration 安全基线

- 远端 D1 已在修改前导出备份；
- migration 为新增 nullable TEXT 列，不重写历史行；
- 空库迁移通过；
- 中间 schema 携带合成数据升级通过；
- 旧 Worker 形状的 INSERT 在新 schema 上通过，新增列保持 `NULL`；
- 回滚应用版本时旧 Worker 会忽略新增 nullable 列。

## 远端 migration 验证

- 执行文件：`drizzle/0014_parched_jane_foster.sql`；
- 执行前备份：`backups/2026-08-22/20260822-065813/database.sql`（仅本地保存，不进入 Git）；
- 备份 SHA-256：`1A0685C86795D116AC86E899D112C8823EBB3ED3B0041C138396A6DA8CEE5C10`；
- migration 后 `health_daily.metric_coverage` 已存在；
- 114 条历史记录的 `metric_coverage` 全部保持 `NULL`；
- migration 前后 Health 行数、日期范围及全部数值字段汇总完全一致。
