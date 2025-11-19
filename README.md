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

```bash
cp .dev.vars.example .dev.vars
```

按需填写 `AGENT_KEY`、`MULERUN_API_KEY` 等变量。

### 3) 配置 Wrangler（生产环境）

```bash
cp wrangler.toml.example wrangler.toml
```

复制模板文件后，按生产环境填写 `wrangler.toml`（Cloudflare Pages 项目名、KV 命名空间 ID、`AGENT_ID` 等变量），再执行部署命令。

### 4) 准备 KV 命名空间

```bash
wrangler kv namespace create NONCE_KV_INIT
wrangler kv namespace create NONCE_KV_INIT --preview
```

### 5) 本地开发

```bash
npm run build   # 先构建一次，供 Functions 读取
npm run dev     # 同时启动 Vite (前端) + Wrangler (后端)
```

- 壳应用（展示会话信息 + iframe）：http://localhost:5173
- 默认 iframe 页面：http://localhost:5173/apps/init/index.html

### 6) 构建与部署

```bash
npm run build
npm run pages:deploy
```

部署后，在 MuleRun Creator Studio 中配置 `https://<pages-domain>/apps/init/index.html` 作为 Start Session URL。

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


生产环境建议通过 `wrangler pages secret put <NAME>` 注入敏感变量。

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
├── functions/              # Cloudflare Pages Functions
│   └── api/
│       ├── ai.ts           # MuleRun API 统一代理 + 计量上报
│       ├── metering.ts     # 计量上报
│       └── session.ts      # 签名校验 + Nonce 管理
├── src/
│   ├── App.tsx             # React 壳层
│   └── config.ts
├── scripts/                # 初始化 / 复制模板脚本
├── public/
├── wrangler.toml
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

- 如果需要跳过 session 校验，可在本地设置 `SESSION_VALIDATION_DISABLED=true`，或将 `sessionId` 加入 `DEV_SESSION_ALLOWLIST`。
- `wrangler.toml` 中的 Pages 项目名与 KV 绑定可通过 `npm run init:project` 一键更新。
