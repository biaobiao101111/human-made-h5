const MODEL = "glm-4.7-flash";
const ZHIPU_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

export const ALLOWED_ORIGINS = new Set([
  "https://biaobiao101111.github.io",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
]);

const analysisShape = {
  summary: "不超过60字的判断",
  dimensions: {
    personal_anchor: "0到100的整数",
    specific_detail: "0到100的整数",
    judgment: "0到100的整数",
    choice: "0到100的整数",
    voice: "0到100的整数",
  },
  assessments: [{ id: 0, level: "human|potential|generic", reason: "不超过30字" }],
  questions: [
    { question: "问题", placeholder: "简短填写提示", target: "缺失维度" },
    { question: "问题", placeholder: "简短填写提示", target: "缺失维度" },
  ],
};

const enrichmentShape = {
  summary: "不超过60字的判断",
  dimensions: {
    personal_anchor: "0到100的整数",
    specific_detail: "0到100的整数",
    judgment: "0到100的整数",
    choice: "0到100的整数",
    voice: "0到100的整数",
  },
  revised_text: "整理后的完整文章",
  used_details: ["实际使用的用户补充1", "实际使用的用户补充2"],
};

export function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://biaobiao101111.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function sendJson(response, data, status, origin) {
  Object.entries({
    ...corsHeaders(origin),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  }).forEach(([key, value]) => response.setHeader(key, value));
  return response.status(status).json(data);
}

export function validateRequest(request, response) {
  const origin = request.headers.origin ?? "";
  if (request.method === "OPTIONS") {
    Object.entries(corsHeaders(origin)).forEach(([key, value]) => response.setHeader(key, value));
    response.status(204).end();
    return { handled: true, origin };
  }
  if (request.method !== "POST") {
    sendJson(response, { error: "Method not allowed" }, 405, origin);
    return { handled: true, origin };
  }
  if (!ALLOWED_ORIGINS.has(origin)) {
    sendJson(response, { error: "Origin not allowed" }, 403, origin);
    return { handled: true, origin };
  }
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (contentLength > 20_000) {
    sendJson(response, { error: "提交内容过长。" }, 413, origin);
    return { handled: true, origin };
  }
  return { handled: false, origin };
}

export function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function splitSentences(text) {
  const pieces = text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n/g)?.filter(Boolean) ?? [text];
  const textPieces = pieces.filter((piece) => piece !== "\n");
  if (textPieces.length <= 40) return textPieces;

  const groups = [];
  for (let index = 0; index < textPieces.length; index += Math.ceil(textPieces.length / 40)) {
    groups.push(textPieces.slice(index, index + Math.ceil(textPieces.length / 40)).join(""));
  }
  return groups;
}

function parseModelContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("模型没有返回可解析结果");
  const clean = content.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(clean);
}

export async function runZhipu(messages, maxTokens) {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    const error = new Error("服务端尚未配置 ZHIPU_API_KEY");
    error.statusCode = 503;
    throw error;
  }

  const upstream = await fetch(ZHIPU_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      stream: false,
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const error = new Error(`智谱接口返回 ${upstream.status}`);
    error.statusCode = upstream.status === 429 ? 429 : 502;
    throw error;
  }
  return parseModelContent(data);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function normalizeDimensions(raw = {}) {
  return {
    personal_anchor: clampScore(raw.personal_anchor),
    specific_detail: clampScore(raw.specific_detail),
    judgment: clampScore(raw.judgment),
    choice: clampScore(raw.choice),
    voice: clampScore(raw.voice),
  };
}

function scoreDimensions(dimensions) {
  return clampScore(
    dimensions.personal_anchor * 0.25 +
      dimensions.specific_detail * 0.2 +
      dimensions.judgment * 0.2 +
      dimensions.choice * 0.2 +
      dimensions.voice * 0.15,
  );
}

function labelForScore(score) {
  if (score < 30) return "还没看见你";
  if (score < 50) return "看见一点轮廓";
  if (score < 70) return "已经能听见你";
  if (score < 85) return "很像你会说的话";
  return "这里面很有你";
}

export async function analyzeText(text) {
  const sentences = splitSentences(text);
  const numberedSentences = sentences.map((sentence, id) => ({ id, text: sentence }));
  const modelData = await runZhipu(
    [
      {
        role: "system",
        content: `你是“含人量”文本分析器。含人量不是人工撰写比例，也不是AI生成率，而是文本中来自作者本人、换个人就不容易原样成立的信息密度。
依据五项分别评分：个人锚点、具体细节、判断立场、选择取舍、表达指纹。只分析文本呈现出的信号，不能声称验证经历真假。不要因为姓名、地址等隐私而加分；不要奖励故意口语化、错别字或堆砌数字。正式通知等文本含人量低不代表质量差。
对每个句子ID给出等级：human=明显属于作者，potential=有个人方向但可更具体，generic=泛化或谁都能说。根据最缺失的维度提出两个具体、容易回答、与原文直接相关的问题。
必须只返回一个JSON对象，不要Markdown。字段和层级严格遵循：${JSON.stringify(analysisShape)}。assessments必须覆盖用户提供的每个句子ID，questions必须恰好两项。全部使用简体中文。`,
      },
      { role: "user", content: `请分析以下编号句子：\n${JSON.stringify(numberedSentences)}` },
    ],
    1800,
  );

  const dimensions = normalizeDimensions(modelData.dimensions);
  const score = scoreDimensions(dimensions);
  const assessments = new Map(
    Array.isArray(modelData.assessments)
      ? modelData.assessments.map((item) => [Number(item.id), item])
      : [],
  );
  const questions = Array.isArray(modelData.questions)
    ? modelData.questions.slice(0, 2).map((item) => ({
        question: cleanText(item.question, 100),
        placeholder: cleanText(item.placeholder, 80),
        target: cleanText(item.target, 30),
      }))
    : [];
  const fallbacks = [
    { question: "这件事里，哪一个具体瞬间你现在还记得？", placeholder: "写下真实发生的一幕……", target: "具体细节" },
    { question: "如果只能保留一个判断，你真正想说什么？", placeholder: "像你平时说话就好……", target: "判断立场" },
  ];
  while (questions.length < 2) questions.push(fallbacks[questions.length]);

  return {
    score,
    label: labelForScore(score),
    summary: cleanText(modelData.summary, 120),
    dimensions,
    segments: sentences.map((sentence, id) => {
      const assessment = assessments.get(id);
      return {
        text: sentence,
        level: ["human", "potential", "generic"].includes(assessment?.level)
          ? assessment.level
          : "generic",
        reason: cleanText(assessment?.reason, 100),
      };
    }),
    questions,
    model: MODEL,
  };
}

export async function enrichText(text, answers) {
  const modelData = await runZhipu(
    [
      {
        role: "system",
        content: `你是“含人量”整理助手。只能使用原文和用户回答里已经出现的事实、经历、判断和措辞，绝对不能编造人物、数字、场景、感受或结果。把补充内容自然整理回原文，尽量保持作者原来的语气和篇幅。随后按个人锚点、具体细节、判断立场、选择取舍、表达指纹五项分别评分。这不是AI生成率，也不是事实核验。
必须只返回一个JSON对象，不要Markdown。字段和层级严格遵循：${JSON.stringify(enrichmentShape)}。全部使用简体中文。`,
      },
      {
        role: "user",
        content: `原文：\n${text}\n\n用户回答：\n${answers.map((answer, index) => `${index + 1}. ${answer}`).join("\n")}`,
      },
    ],
    1600,
  );

  const dimensions = normalizeDimensions(modelData.dimensions);
  const score = scoreDimensions(dimensions);
  return {
    score,
    label: labelForScore(score),
    summary: cleanText(modelData.summary, 120),
    dimensions,
    revisedText: cleanText(modelData.revised_text, 3000),
    usedDetails: Array.isArray(modelData.used_details)
      ? modelData.used_details.slice(0, 2).map((item) => cleanText(item, 120))
      : [],
    model: MODEL,
  };
}

export function publicError(error) {
  if (error?.statusCode === 503) return { status: 503, message: "AI 服务正在配置，请稍后再试。" };
  if (error?.statusCode === 429) return { status: 429, message: "现在体验的人有点多，请稍后再试。" };
  return { status: 500, message: "AI 暂时没有完成分析，请稍后再试。" };
}
