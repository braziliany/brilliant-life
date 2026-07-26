# 璀璨人生

基于 React、vinext 和 Cloudflare Workers 构建的健康、工作、工资与生活仪表盘。

## 本地运行

需要 Node.js 22.13 或更高版本：

```bash
npm install
npm run dev
```

## 构建验证

```bash
npm run build
npm test
```

项目通过 Cloudflare Vite 插件生成 Worker 兼容的 ESM 构建，可从 Codex Sites 直接发布到 Cloudflare。`.openai/hosting.json` 已保留 D1 和 R2 的扩展入口；当前演示数据为前端静态数据，因此无需创建数据库或存储桶。

主要页面位于 `app/page.tsx`，视觉样式位于 `app/globals.css`。
