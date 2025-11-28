# init

基于 MuleRun IFrame Agent 规范的模板项目，开箱包含：

- 会话签名校验与 nonce 防重复
- MuleRun 官方 API 统一代理（ChatGPT / Gemini / Anthropic 等）
- 计量上报流程及本地调试旁路
- React 壳层 + iframe 子应用结构（默认应用 `apps/init`）

## 快速上手

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

新建 `.env.local`（不会被提交），填入你在 MuleRun 后台申请到的变量，例如：

```
AGENT_ID=xxx
AGENT_KEY=sk-xxx
MULERUN_API_KEY=mrk-xxx
SESSION_ALLOWED_ORIGINS=mulerun.com,localhost
PRICING_MARKUP_MULTIPLIER=1
```

如需使用 Vercel KV，请同步配置 `KV_REST_API_URL` / `KV_REST_API_TOKEN` / `KV_REST_API_READ_ONLY_TOKEN` 三个变量；本地缺省会退回到内存 KV（仅供调试，不持久化）。

### 3) 本地开发

```bash
npm run dev       # 同时启动 Vite (前端) + Node dev server (后端)
```

- 壳应用：http://localhost:5173
- 默认 iframe 页面：http://localhost:5173/apps/init/index.html
- 后端接口由 `http://localhost:8788` 提供，Vite 已自动代理 `/api/*`

### 4) 构建

```bash
npm run build
```

构建产物默认输出到 `dist/`，供 Vercel 静态托管。

## Vercel 一键部署

1. **创建 Vercel KV（推荐）**  
   - Vercel Dashboard → Storage → Create KV。  
   - 记录 `KV_REST_API_URL`、`KV_REST_API_TOKEN`、`KV_REST_API_READ_ONLY_TOKEN`，稍后写入项目环境变量。  
   - 若暂时不需要持久化，可跳过，此时会使用内存 KV（仅调试用）。

2. **导入代码仓库**  
   - 将本仓库推送到 GitHub/GitLab。  
   - Vercel Dashboard → Add New → Project → 选择对应仓库。

3. **自定义构建设置**  
   - Framework：`Vite`（或保持 “Other” 也可）。  
   - Build Command：`npm run build`。  
   - Install Command：`npm install`。  
   - Output Directory：`dist`。  
   - `vercel.json` 已预置 `rewrites` 与 Functions 运行时，无需手动配置。

4. **注入环境变量**  
   - 在 “Environment Variables” 中填写下表各项。  
   - 推荐至少配置：`AGENT_ID`、`AGENT_KEY`、`MULERUN_API_KEY`、`SESSION_ALLOWED_ORIGINS`、`KV_*` 三个变量。

5. **点击 Deploy**  
   - 首次部署完成后即可拿到域名，例如 `https://<project>.vercel.app`。  
   - 在 MuleRun Creator Studio 中设置 `https://<project>.vercel.app/apps/init/index.html` 作为 Start Session URL。

后续更新只需推送到主分支，Vercel 会自动重新构建 & 部署。若需要预览环境，可使用 Vercel Preview Branch。

## 配置说明

| 变量名 | 说明 |
| --- | --- |
| `AGENT_KEY` | MuleRun Agent 密钥，用于签名校验与计量认证 |
| `MULERUN_API_KEY` | MuleRun 开放平台 API Token，用于代理大模型请求 |
| `MULERUN_API_BASE` | MuleRun API 基础地址，默认 `https://api.mulerun.com` |
| `PRICING_MARKUP_MULTIPLIER` | 成本价乘数，控制最终售卖价格，默认 `1` |
| `DEV_SESSION_ALLOWLIST` | （可选）本地允许跳过签名校验的 `sessionId` 列表（逗号分隔） |
| `SESSION_ALLOWED_ORIGINS` | 允许会话来源的域名白名单（逗号分隔，默认 `mulerun.com`，可加入 `localhost` 或 `*`） |
| `SESSION_TTL_SECONDS` | （可选）KV 中的会话存活时间（单位秒，默认 3600，范围 60-604800） |
| `SESSION_VALIDATION_DISABLED` | （可选）设为 `true`/`1` 时关闭所有会话校验，方便纯本地测试 |
| `SESSION_REQUIRE_FINGERPRINT` | （可选）设为 `true` 时强制校验浏览器指纹 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` / `KV_REST_API_READ_ONLY_TOKEN` | Vercel KV 连接信息（推荐线上环境务必开启） |

> 在 Vercel 上可通过 `Settings → Environment Variables` 填写上述值；本地可放在 `.env.local`。


生产环境请避免把密钥写进代码仓库，统一通过 Vercel 环境变量/Projects Secret 管理。

## 模板应用与脚本

- 默认业务 iframe 在 `apps/init`，直接从 `apps/_template` 复制得到，可按需修改 `index.html` / `main.js` / `styles.css`。
- 创建新 iframe 应用：`npm run create:app <app-slug>`（内部会复制 `apps/_template`）。
- 批量调整项目名 / 默认应用 / 展示标题：`npm run init:project -- --name <project-name> --title "<Title>" --app <default-app>`.

## 项目结构

```
init/
├── apps/
│   ├── _template/          # 可复制的页面模板
│   └── init/               # 默认示例页面
├── api/                    # Vercel Serverless Functions (Node 18)
│   ├── ai.ts
│   ├── metering.ts
│   └── session.ts
├── functions/              # 业务逻辑（同时供 Vercel API 与测试复用）
├── src/
│   ├── App.tsx             # React 壳层
│   └── config.ts
├── scripts/                # 初始化 / 复制模板脚本
├── public/
├── server/                 # Vercel/Node 运行时适配 & 本地 dev server
└── package.json
```

## 可用 API 概览

- `GET /api/session`：验签、写入 nonce 与 KV 会话。
- `POST /api/ai`：统一代理，支持 `operation = chat | image_generate | image_edit`。
- `POST /api/metering`：计量上报。
- （可按需扩展下载/代理功能，默认模板未包含）

### `/api/ai` 支持的能力示例

- `chat`：通用对话/补全（示例见 `EXAMPLES.md`）。
- `image_generate`：文生图，长时轮询拿结果（使用 Google Nano Banana 示例模型）。
- `image_edit`：用户上传图片 + 提示词，实时返回结果（使用 Google Nano Banana 示例模型）。

> 页面内置“接口快速体验”标签切换，可自定义 prompt、上传图片，并直接查看返回图片与价格/计量信息。需要你已配置有效的 `MULERUN_API_KEY` / `AGENT_KEY`，或在本地开启 `SESSION_VALIDATION_DISABLED`。

## 调试小贴士

- 本地缺省读取 `.env.local`，不需要 `wrangler`。  
- 如果需要跳过 session 校验，可设置 `SESSION_VALIDATION_DISABLED=true`，或将 `sessionId` 加入 `DEV_SESSION_ALLOWLIST`。  
- `npm run dev` 会热重载 API（通过 `tsx --watch`）与前端（Vite）。
