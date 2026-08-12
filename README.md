# 璀璨人生

部署在 Cloudflare Workers 上的个人生活仪表盘，集中管理 Apple 健康汇总、工作日历、工资快照、职业经历和生命财务。

## 技术架构

- React 19、vinext、Vite；
- Cloudflare Workers 运行时；
- Cloudflare D1 持久化真实个人数据；
- Cloudflare Access 保护网页和读取接口；
- 独立 Worker Secret 验证 Health Auto Export 上传；
- Drizzle schema 和顺序 SQL migration 管理数据库结构。
- Life Finance 通过钱迹 JSON / Excel 适配器进行幂等增量导入，金额使用整数分保存。

公开仓库不包含生产备份、健康原始 JSON、API Key、Access Token、请求头或设备名称。

## 本地环境

需要 Node.js 22.13 或更高版本、Git 和 Wrangler。

```powershell
npm ci
npm run dev
```

本地开发使用项目内 Wrangler 状态，不应连接生产 D1。生产 Secret 不写入 `.env`、代码、文档或 Git 历史。

## 发布前统一验证

```powershell
npm run verify
```

该命令依次执行：

1. vinext 生产构建；
2. API、健康、日历、工资和职业经历领域回归；
3. 空库与带合成数据中间 schema 的本地 D1 migration 烟雾测试；
4. 在 Wrangler 本地 Workers 运行时检查构建后的 HTML 和安全响应头。

测试只使用临时本地数据库和合成数据，完成后自动清理，不读取生产备份。

## Life Finance

生命财务不是记账软件替代品。钱迹继续负责日常记录，璀璨人生负责标准化、生命领域分类和长期轨迹。当前支持钱迹 JSON 与 Excel 手动增量导入；原始账单文件不会保存到服务器，也不得提交 Git。详细设计见 `docs/life-finance.md`。

## D1 schema 与 migration

只有 `db/schema.ts` 确实变化时才运行：

```powershell
npm run db:generate
```

生成后必须人工检查新的 `drizzle/*.sql`，运行 `npm run verify`，并在任何生产结构变更前完成备份。不得重复执行已应用 migration，也不得修改已经发布的旧 migration。

## 备份与恢复

创建生产 D1 备份：

```powershell
npm run db:backup
```

恢复必须先在独立临时 D1 演练并通过 `db:verify`；生产恢复需要显式目标和人工确认。详细流程见 `docs/D1-备份恢复说明.md` 与 `docs/部署与恢复手册.md`。`backups/` 始终保持 Git 忽略，并应另存一份加密副本。

## Cloudflare Access 与健康上传

- `pulse.sophier.org` 由 Cloudflare Access 保护；
- Workers.dev 上的受保护读取接口不能依赖可伪造的 Access 请求头；
- Health Auto Export 通过 `X-API-Key` 使用独立的 `HEALTH_INGEST_API_KEY` Worker Secret；
- Secret 只能通过 Wrangler/Cloudflare 管理并写入 iPhone 客户端，不能提交到仓库；
- 密钥轮换后必须手动同步一次，确认上传成功和连续性记录正常。

## 正式发布

当前正式发布路径是 Wrangler：

```powershell
npm run verify
npx wrangler deploy
```

涉及 D1 schema 时，应先备份、在隔离数据库完成恢复与升级演练，再应用生产 migration，最后发布匹配的 Worker。发布后检查 Cloudflare Access 登录跳转、Workers.dev 未登录 API 返回 401，以及健康同步是否成功。

Codex Sites 完整归档目前会超过 10 MiB 限制，因此不是本项目的正式发布路径；实际 Worker 模块体积远低于该限制。不要为了压缩归档删除业务资源或升级依赖。

## 年度日历维护

官方节假日按年度保存在 `app/features/calendar/holiday-data/<year>.ts`。当前配置 2026 年；未配置年份只提供星期规则和个人修改，并禁止保存工资。新增年度文件时必须依据正式通知并通过全年工作日和工资回归测试，不能覆盖旧年度数据。
