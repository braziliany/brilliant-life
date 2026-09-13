# Machine-to-Machine Access Boundary

状态：Accepted（2026-09-13）

## 背景

Pulse 同时存在 Owner Dashboard、Calendar Widget 机器读取与 Health Ingest 机器写入。关闭 `workers_dev` 与 Preview URLs 是必要的 Worker 暴露面收口，但也证明机器客户端不能继续依赖通用 workers.dev 公共入口。不同机器客户端、数据范围与读写语义必须在正式域名上拥有可独立验证的边界。

## 决策

- 机器客户端不再依赖通用 workers.dev 公共入口；`workers_dev = false`、`preview_urls = false` 保持关闭。
- 一个机器客户端对应一个精确 path boundary 与一个独立 Cloudflare Access Service Token。
- Calendar Widget 只使用 `GET /api/v1/calendar/widget` 与 Calendar Service Token。
- Health Ingest 只使用 `POST /api/health/ingest` 与 Health Service Token，并由 Worker 继续校验独立 `X-API-Key`。
- Service Token 不跨机器 endpoint，也不能进入 `pulse.sophier.org/*` 的 Owner Dashboard/private read 边界。
- 当读取与写入具有不同安全语义时拆分 route，不只依赖同一路径上的 HTTP method；因此 `/api/health` 保持 Owner-only 读取，机器写入使用 `/api/health/ingest`。
- Cloudflare Access 的 path boundary 负责客户端与入口隔离，Worker application auth 负责业务请求鉴权；两层共同构成 Health Ingest 的分层鉴权。

## 结果

当前只维护 Dashboard、Calendar Widget、Health Ingest 三类已存在入口，不为未来客户端预设通用 token、通配 path 或共享机器应用。新增机器客户端时必须重新定义其最小 path、独立身份与 Worker 内业务鉴权需求。
