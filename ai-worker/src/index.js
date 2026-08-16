const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const ALLOWED_ORIGINS = new Set([
  "https://biaobiao101111.github.io",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
]);

const dimensionsSchema = {
  type: "object",
  properties: {
    personal_anchor: { type: "integer", minimum: 0, maximum: 100 },
    specific_detail: { type: "integer", minimum: 0, maximum: 100 },
    judgment: { type: "integer", minimum: 0, maximum: 100 },
    choice: { type: "integer", minimum: 0, maximum: 100 },
    voice: { type: "integer", minimum: 0, maximum: 100 },
  },
  required: ["personal_anchor", "specific_detail", "judgment", "choice", "voice"],
  additionalProperties: false,
};

const analysisSchema = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    label: { type: "string" },
    summary: { type: "string" },
    dimensions: dimensionsSchema,
    assessments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          level: { type: "string", enum: ["human", "potential", "generic"] },
          reason: { type: "string" },
        },
        required: ["id", "level", "reason"],
        additionalProperties: false,
      },
    },
    questions: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          placeholder: { type: "string" },
          target: { type: "string" },
        },
        required: ["question", "placeholder", "target"],
        additionalProperties: false,
      },
    },
  },
  required: ["score", "label", "summary", "dimensions", "assessments", "questions"],
  additionalProperties: false,
};

const enrichmentSchema = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    label: { type: "string" },
    summary: { type: "string" },
    dimensions: dimensionsSchema,
    revised_text: { type: "string" },
    used_details: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: { type: "string" },
    },
  },
  required: ["score", "label", "summary", "dimensions", "revised_text", "used_details"],
  additionalProperties: false,
};

function splitSentences(text) {
  return text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n/g)?.filter(Boolean) ?? [text];
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://biaobiao101111.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status, origin) {
  return Response.json(data, {
    status,
    headers: {
      ...corsHeaders(origin),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseModelResponse(result) {
  const payload = result?.response ?? result;
  if (payload && typeof payload === "object") return payload;
  if (typeof payload !== "string") throw new Error("模型没有返回可解析结果");
  const clean = payload.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(clean);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
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

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeAnalysis(modelData, sentences) {
  const assessments = new Map(
    Array.isArray(modelData.assessments)
      ? modelData.assessments.map((item) => [Number(item.id), item])
      : [],
  );
  const segments = sentences.map((sentence, id) => {
    const assessment = assessments.get(id);
    const level = ["human", "potential", "generic"].includes(assessment?.level)
      ? assessment.level
      : "generic";
    return {
      text: sentence,
      level,
      reason: cleanText(assessment?.reason, 100),
    };
  });

  const questions = Array.isArray(modelData.questions)
    ? modelData.questions.slice(0, 2).map((item) => ({
        question: cleanText(item.question, 100),
        placeholder: cleanText(item.placeholder, 80),
        target: cleanText(item.target, 30),
      }))
    : [];

  while (questions.length < 2) {
    questions.push(
      questions.length === 0
        ? {
            question: "这件事里，哪一个具体瞬间你现在还记得？",
            placeholder: "写下真实发生的一幕……",
            target: "具体细节",
          }
        : {
            question: "如果只能保留一个判断，你真正想说什么？",
            placeholder: "像你平时说话就好……",
            target: "判断立场",
          },
    );
  }

  const rawDimensions = modelData.dimensions ?? {};
  const dimensions = {
    personal_anchor: clampScore(rawDimensions.personal_anchor),
    specific_detail: clampScore(rawDimensions.specific_detail),
    judgment: clampScore(rawDimensions.judgment),
    choice: clampScore(rawDimensions.choice),
    voice: clampScore(rawDimensions.voice),
  };
  const score = scoreDimensions(dimensions);
  return {
    score,
    label: labelForScore(score),
    summary: cleanText(modelData.summary, 120),
    dimensions,
    segments,
    questions,
    model: MODEL,
  };
}

async function analyze(env, text) {
  const sentences = splitSentences(text).filter((sentence) => sentence !== "\n");
  const numberedSentences = sentences.map((sentence, id) => ({ id, text: sentence }));
  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content: `你是“含人量”文本分析器。含人量不是人工撰写比例，也不是AI生成率，而是文本中来自作者本人、换个人就不容易原样成立的信息密度。
请依据五项评分：个人锚点25%、具体细节20%、判断立场20%、选择取舍20%、表达指纹15%。
只分析文本呈现出的信号，不能声称验证经历真假。不要因为暴露姓名、地址等隐私就加分；不要奖励故意口语化、错别字或堆砌数字。正式通知等文本含人量低不等于质量差。
对每个句子ID给出等级：human=明显属于作者，potential=有个人方向但可更具体，generic=泛化或谁都能说。再根据缺失维度提出两个具体、容易回答、与原文直接相关的问题。全部使用简体中文。`,
      },
      {
        role: "user",
        content: `请分析以下编号句子：\n${JSON.stringify(numberedSentences)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: analysisSchema,
    },
    max_tokens: 1200,
    temperature: 0.2,
  });
  return normalizeAnalysis(parseModelResponse(result), sentences);
}

async function enrich(env, text, answers) {
  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content: `你是“含人量”整理助手。只能使用原文和用户回答中已经出现的事实、经历、判断和措辞，绝对不能编造人物、数字、场景、感受或结果。
把用户补充的真实内容自然整理回原文，尽量保持作者原来的语气和篇幅。随后按照同一套含人量标准重新评分：个人锚点25%、具体细节20%、判断立场20%、选择取舍20%、表达指纹15%。这不是AI生成率，也不是事实核验。全部使用简体中文。`,
      },
      {
        role: "user",
        content: `原文：\n${text}\n\n用户回答：\n${answers.map((answer, index) => `${index + 1}. ${answer}`).join("\n")}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: enrichmentSchema,
    },
    max_tokens: 1100,
    temperature: 0.25,
  });
  const modelData = parseModelResponse(result);
  const rawDimensions = modelData.dimensions ?? {};
  const dimensions = {
    personal_anchor: clampScore(rawDimensions.personal_anchor),
    specific_detail: clampScore(rawDimensions.specific_detail),
    judgment: clampScore(rawDimensions.judgment),
    choice: clampScore(rawDimensions.choice),
    voice: clampScore(rawDimensions.voice),
  };
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") ?? "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "human-made-ai" }, 200, origin);
    }
    if (request.method !== "POST" || !["/analyze", "/enrich"].includes(url.pathname)) {
      return json({ error: "Not found" }, 404, origin);
    }
    if (!ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "Origin not allowed" }, 403, origin);
    }

    try {
      const body = await request.json();
      const text = cleanText(body.text, 2000);
      if (text.length < 20) {
        return json({ error: "文字太短，请至少输入20个字。" }, 400, origin);
      }

      if (url.pathname === "/analyze") {
        return json(await analyze(env, text), 200, origin);
      }

      const answers = Array.isArray(body.answers)
        ? body.answers.slice(0, 2).map((answer) => cleanText(answer, 240))
        : [];
      if (answers.length !== 2 || answers.some((answer) => !answer)) {
        return json({ error: "请回答两个问题后再继续。" }, 400, origin);
      }
      return json(await enrich(env, text, answers), 200, origin);
    } catch (error) {
      console.error(error);
      return json({ error: "AI 暂时没有完成分析，请稍后再试。" }, 500, origin);
    }
  },
};
