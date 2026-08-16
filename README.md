# 含人量检测 · Human Made

一个手机端 H5 小产品：让 AI 分析一段文字中有多少真实经历、具体细节、个人判断、选择取舍和表达指纹，并通过两个针对原文的追问，把用户自己补回文字。

## 产品闭环

1. 粘贴 20～2000 字文字；
2. AI 返回含人量总分、五维雷达图、简短判断和逐句高亮；
3. AI 根据原文缺失的维度提出两个问题；
4. 用户回答后，AI 只使用原文和回答整理新版本，再次评分，并用叠加雷达图对比提升前后。

含人量不是人工撰写比例，也不是 AI 生成率或事实核验。总分由五项维度固定加权：个人锚点 25%、具体细节 20%、判断立场 20%、选择取舍 20%、表达指纹 15%。

页面使用“浦柒 AI观察 / PUQI OBS.”文字章作为当前发起方标识；这不是已经确认的独立图形 Logo。

## 技术结构

- `docs/`：GitHub Pages 使用的纯静态手机端页面；
- `zhipu-api/`：部署在 Vercel 的智谱 API 后端；
- `app/`：React/Vinext 开发版本；
- AI 模型：`glm-4.7-flash`；
- API：`POST /api/analyze` 和 `POST /api/enrich`。

浏览器中不存放 API Key。正文会经 Vercel 函数发送到智谱完成本次推理，应用代码不把正文写入数据库，响应也明确禁止缓存。

## 本地验证

```bash
npm install
npm run lint
npm test
node --check zhipu-api/lib/human-made.js
```

## 部署

前端仓库和现有演示页：

- https://github.com/biaobiao101111/human-made-h5
- https://biaobiao101111.github.io/human-made-h5/
- https://zhipu-api.vercel.app/api/health

AI 后端以 `zhipu-api/` 为 Vercel 项目根目录，环境变量名称固定为：

```bash
ZHIPU_API_KEY
```

真实密钥只在 Vercel 控制台填写，不能写入源码或提交到 GitHub。线上后端已完成真实调用验证，前端通过 `https://zhipu-api.vercel.app/api` 请求服务。免费模型短时间连续调用可能返回 429，页面会提示用户稍后再试。
