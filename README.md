# Course-Hub

基于 Cloudflare Pages + D1 + R2 的课程网站项目，面向课程的资料发布、作业管理、讨论互动与后台管理。

## 一键部署

### 1. 点击按钮创建 Pages 项目

- 点击 [![Create Pages Project](https://img.shields.io/badge/Cloudflare-Create%20Pages-F38020?logo=cloudflare&logoColor=white)](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages) 按钮
- 选择导入本 GitHub 仓库
- 进入构建设置（必须按下面填写）

### 2. 构建配置（仓库根目录构建）

- 框架预设：`None`
- 路径：`/`（仓库根目录，不填即可）
- 构建命令：`npm --prefix backend ci && npm --prefix frontend ci && npm --prefix frontend run build`
- 构建输出目录：`frontend/dist`
- 函数服务目录：`functions`（默认会自动识别）

### 3. 环境变量与密钥（下一步配置）

Variables：

- `APP_ENV=production`（建议填写；不填时将按 development 处理）
- `ALLOWED_ORIGINS`（可选；留空时默认放行 `https://*.pages.dev`）
- `JWT_ISSUER=course-hub`（可选；默认即此值）
- `JWT_AUDIENCE=course-hub-users`（可选；默认即此值）
- `MATERIAL_MAX_SIZE_MB=10240`（可选单文件最大上传大小；默认 100）

Secrets：

- `JWT_SECRET=<随机强密钥，建议 32 位以上>`（可选；未配置时生产环境会自动生成并存储到 KV 或 D1，仍建议显式配置便于统一管理）

兼容性：

- Compatibility date 建议使用最新稳定日期
- Compatibility flags 可留空；仅在你额外引入 Node 专用库时报错时再开启 `nodejs_compat`

### 4. 绑定后端资源（在 Pages 项目里配置）

记得提前创建好对应资源集在 Pages 控制台的 设置 中配置以下绑定：

- D1：绑定变量名称 `DB`
- R2：绑定变量名称 `BUCKET`
- 可选 KV：绑定变量名称 `KV`

绑定完成后需要重新部署一次才能生效！在部署里的当前部署版本选择右边的三个点，点击重试部署

### 5. 验证上线

- 打开 `https://<你的 Pages 域名>/`，确认前端可访问
- 打开 `https://<你的 Pages 域名>/api/health`，返回 `status: ok`
- 首次部署打开 `https://<你的 Pages 域名>/install` 完成管理员初始化

若安装页提示“服务器处理请求失败，请稍后重试”，优先检查是否遗漏了 D1 绑定 `DB`。

## 说明

- 本仓库已包含 Pages Functions 入口文件，`/api/*` 会由 Functions 处理。

## 跨域配置说明

- 单 Pages 项目默认同域访问，通常不会触发跨域问题。
- 若未配置 `ALLOWED_ORIGINS`，系统会默认放行 `https://*.pages.dev`。
- 你可以在后台「站点设置 -> 跨域来源」里添加自定义域名，支持逗号或换行分隔。
- 后台保存后会自动清理跨域缓存并在短时间内生效。

## 本地开发（可选）

环境要求：Node.js 20+、npm、Cloudflare Wrangler

后端：

```powershell
cd backend
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:init
npm run dev
```

前端：

```powershell
cd frontend
npm install
npm run dev
```

## 技术栈

- 前端：Vue 3、Vite、Pinia、Vue Router、Tailwind CSS、Axios
- 后端：Cloudflare Workers、Hono
- 数据与存储：D1、R2（可选 KV）
- 认证与安全：JWT、bcryptjs、基础限流与审计日志
- 部署：Cloudflare Pages（含 Functions）

## 许可证

MIT License

## 补充

可选启用 Metrics API，请在运行环境配置账号与令牌变量（如 CF_ACCOUNT_ID / CF_API_TOKEN 或 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN）。未配置时会自动回退估算容量

> 当前使用 `functions/[[path]].js` 处理 `/api/*` 与 SPA 回退，无需额外配置 `_redirects`。
> 前端默认请求 `/api`，单项目部署时同域访问，不需要额外设置 `VITE_API_BASE_URL`。

## 绑定配置参考

根目录 `wrangler.toml` 里的关键绑定项如下：

- `[[d1_databases]].database_id`
- `[[r2_buckets]].bucket_name`
- `[assets].directory`

本地后端开发可继续使用 `backend/wrangler.toml`。
