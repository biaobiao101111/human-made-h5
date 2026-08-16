# 含人量检测 · Human Made

一个手机端 H5 小产品：让 AI 分析一段文字中有多少真实经历、具体细节、个人判断、选择取舍和表达指纹，并通过两个针对原文的追问，把用户自己补回文字。

## 产品闭环

1. 粘贴 20～2000 字文字；
2. AI 返回含人量分数、简短判断和逐句高亮；
3. AI 根据原文缺失的维度提出两个问题；
4. 用户回答后，AI 只使用原文和回答整理新版本，再次评分。

含人量不是人工撰写比例，也不是 AI 生成率或事实核验。总分由五项维度固定加权：个人锚点 25%、具体细节 20%、判断立场 20%、选择取舍 20%、表达指纹 15%。

## 技术结构

- `docs/`：GitHub Pages 使用的纯静态手机端页面；
- `ai-worker/`：Cloudflare Worker + Workers AI 后端；
- `app/`：React/Vinext 开发版本；
- AI 模型：`@cf/meta/llama-3.1-8b-instruct-fast`；
- API：`POST /analyze` 和 `POST /enrich`。

浏览器中不存放 API Key。正文会发送到 Cloudflare Workers AI 完成本次推理，应用代码不把正文写入数据库，响应也明确禁止缓存。

## 本地验证

```bash
npm install
npm run lint
npm test
npx wrangler deploy --dry-run --config ai-worker/wrangler.jsonc
```

## 部署

前端仓库和现有演示页：

- https://github.com/biaobiao101111/human-made-h5
- https://biaobiao101111.github.io/human-made-h5/

AI 版部署顺序：

```bash
npx wrangler login
npx wrangler deploy --config ai-worker/wrangler.jsonc
```

部署 Worker 后，把 Wrangler 返回的 `workers.dev` 地址写入 `docs/app.js` 与 `app/page.tsx` 的 `API_BASE_URL`，再合并到 GitHub `main` 分支。当前公开页在 Worker 授权完成前继续保留原演示版本，避免发布不可用页面。
