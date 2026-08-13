# 璀璨人生 Cloudflare Access 登录与恢复手册

## 当前基线

- 应用：Pulse Dashboard
- 受保护范围：`pulse.sophier.org/*`
- 日常登录：One-time PIN
- 授权邮箱：`questioniar@outlook.com`
- Access Policy：仅 `Allow Owner`，Include 为上述完整邮箱；无 Require、Exclude、Bypass、Everyone 或 Email Domain 放行
- 应用 Session：`2 weeks`（14 天）
- Instant Authentication：关闭
- Cloudflare IdP：账户层保留，但 Pulse 应用不选用

## 正常登录

1. 打开 `https://pulse.sophier.org`；
2. 输入授权 Outlook 邮箱并发送登录码；
3. 在 10 分钟内输入 Cloudflare 邮件中的 6 位 PIN；
4. 登录成功后，应用会话按 14 天签发；OTP 本身仍是一次性且使用 Cloudflare 默认有效期。

非授权邮箱即使能收到或提交 PIN，也不满足 `Allow Owner`，不能进入 Pulse。

## 邮件未到

1. 检查垃圾邮件、“其他”收件箱和邮件规则；
2. 等待几分钟，避免连续重发导致旧 PIN 失效或触发限流；
3. 只重发一次，并只使用最新邮件中的 PIN；
4. 在 Zero Trust 的 Access 身份验证日志中确认邮箱、应用和决定；
5. 核对 Pulse 仍只选择 One-time PIN，`Allow Owner` 仍指向完整 Outlook 邮箱。

不要为排查 OTP 修改 Worker、D1、Health ingest、Finance 或业务认证代码。

## 恢复顺序

1. 保持 `pulse.sophier.org/*` 的 Access 应用存在；
2. 确认 One-time PIN IdP 在账户层可用并被 Pulse 选中；
3. 确认唯一 Allow 策略是 `Allow Owner → questioniar@outlook.com`；
4. 确认 Session 为 `2 weeks`；
5. 用无 Cookie 浏览器验证未登录跳转，再用授权邮箱完成 OTP；
6. 验证 `/api/finance` 未登录仍被 Access 拦截，Health Auto Export 的 `workers.dev` POST 无 Key/错 Key仍为 401。

## 机器接口边界

- Health Auto Export 固定使用 `workers.dev` 与 `X-API-Key`，不接入 OTP。
- Finance API 位于正式域名下，匿名访问由 Access 拦截；Worker 内仍保留 Access 身份校验。
- 不在文档、Git 或 Obsidian 中保存 API Key、PIN、Access Cookie 或 JWT。

## 回滚

若 OTP 长时间不可用，先从 Cloudflare 状态与 Access 日志确认故障。恢复其他 IdP 属于权限变更，必须单独审批；不得临时添加 Bypass、Everyone、宽泛邮箱域或匿名访问。
