# Sprint 6 D1 恢复演练记录

## 演练信息

| 项目 | 结果 |
|---|---|
| 日期 | 2026-08-08 |
| 源数据库 | `pulse-health-dashboard-db` |
| 源 database_id | 已核对，公开版本脱敏 |
| 测试数据库 | `pulse-health-dashboard-recovery-drill-20260808` |
| 测试 database_id | 已核对且与生产库不同，公开版本脱敏 |
| Worker 版本 | 已记录于私有运维文档 |
| 备份目录 | `backups/<date>/<timestamp>/` |
| SQL 大小 | 已核对，公开版本脱敏 |
| SQL SHA256 | 已核对，公开版本脱敏 |

备份目录和 SQL 不提交 Git；本记录只保留恢复证明所需的非秘密元数据。

## 恢复结果

- Wrangler 成功处理全部恢复查询；
- 测试数据库成功写入，数据库大小符合预期；
- 6 张业务表全部恢复；
- 4 个唯一索引与 metadata 一致；
- 六张业务表的行数逐表一致；
- 工资历史快照逐字段一致；
- 最新健康记录的日期与来源一致；
- 职业经历排序一致；
- 自动验证结果：通过。

## 安全验证

- 测试 database_id 与生产 ID 不同；
- 恢复脚本先备份了空测试库；
- SQL SHA256 与 metadata 一致；
- 对生产数据库执行保护测试时，脚本在任何备份或导入前返回“Production restore is blocked by default”；
- 生产数据库没有执行恢复、schema 或数据写入；
- `PRAGMA integrity_check` 被 D1 远程环境以 `SQLITE_AUTH` 拒绝，未将其记录为通过。

## 清理

临时数据库已在最终只读复核后删除：

- 删除前再次确认名称为 `pulse-health-dashboard-recovery-drill-20260808`；
- database_id 已核对并记录于私有演练记录；
- 已确认它与生产 ID 不同；
- Wrangler 返回删除成功；
- 删除对象仅为临时演练库，不可恢复，生产 D1 保持存在且未被恢复流程写入。
