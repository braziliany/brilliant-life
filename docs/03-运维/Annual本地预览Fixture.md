# Annual 本地预览 Fixture

## 用途

本机制只为 localhost 的 Annual Archive UI 验收提供纯合成数据，不读取生产 D1，也不通过线上 API 写入数据。

```powershell
npm run build
npm run preview:annual
npm run dev
```

需要在同一 Wi-Fi 的 iPhone 查看时，可临时使用：

```powershell
npm run dev -- --host 0.0.0.0
```

完成后清理：

```powershell
npm run preview:reset
```

## 数据范围

- 年份：2026；合成资料截止日期：2026-08-22。
- Health：可信指标覆盖、早期覆盖未知、确认缺失、明确为 0，以及步数、能量、睡眠、体重、静息心率。
- Time：继续使用产品内置的 2026 官方日历，不复制生产日历数据。
- Career：两段虚构经历，其中一段跨入 2026，一段为当前职位。
- Salary：两个月虚构工资快照，金额与真实工资无关。
- Life Finance：1—8 月共 20 条虚构交易，包含收入、支出、退款、转账和还款，以及多个生活分类和 5 条重要支出；8 月记录截止 8 月 18 日。

## 隔离与保护

- CLI 硬编码使用 Wrangler `--local` 和仓库 `.wrangler/state`。
- CLI 不接受额外参数，因此不能透传 `--remote`。
- seed 前要求 fixture 涉及的业务表均为空；非空时拒绝覆盖。
- `.annual-preview-state/manifest.json` 标记本次 seed；reset 只在标记匹配时执行。
- `.annual-preview-state/`、`.wrangler/` 与本地 SQLite 均不进入 Git。
- fixture 不新增表、不新增 migration、不改变 Annual 计算口径。

## 空状态

空本地 D1、seed 后完整预览、reset 后空本地 D1 三种状态都应使 `/api/annual?year=2026` 返回 HTTP 200；空库不能导致整页失败。
