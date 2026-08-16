const MODEL_ROUTES = [
  { id: "glm-4-flash-250414", timeoutMs: 8_000 },
  { id: "glm-4.7-flash", timeoutMs: 12_000 },
];
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
  evidence: {
    concrete_anchors: ["原文中不可替换的具体人物、地点、物件、数字、原话或事件短语"],
    personal_judgments: ["原文中带理由、比较或反常识的个人判断短语"],
    real_choices: ["原文中包含备选项、取舍或代价的具体选择短语"],
    generic_phrases: ["原文中常见的氛围词、情绪套话或万能结论"],
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
  evidence: {
    concrete_anchors: ["整理后文本中的具体证据短语"],
    personal_judgments: ["整理后文本中的个人判断短语"],
    real_choices: ["整理后文本中的具体取舍短语"],
    generic_phrases: ["整理后文本中的常见套话"],
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
  const textPieces = pieces.filter((piece) => piece.trim());
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

  let lastStatus = 502;
  for (const route of MODEL_ROUTES) {
    try {
      const upstream = await fetch(ZHIPU_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: route.id,
          messages,
          ...(route.id === "glm-4.7-flash" ? { thinking: { type: "disabled" } } : {}),
          response_format: { type: "json_object" },
          stream: false,
          max_tokens: maxTokens,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(route.timeoutMs),
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        lastStatus = upstream.status === 429 ? 429 : 502;
        continue;
      }
      return { data: parseModelContent(data), model: route.id };
    } catch {
      lastStatus = 502;
    }
  }

  const error = new Error("智谱快速与兜底模型均未完成请求");
  error.statusCode = lastStatus;
  throw error;
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

const GENERIC_PATTERNS = [
  /卸下.{0,6}忙碌/,
  /出门走走/,
  /风(?:暖暖|轻轻|温柔)/,
  /草木.{0,6}(?:葱|绿)/,
  /松弛.{0,4}烟火气|人间烟火|烟火气息/,
  /抛开.{0,8}(?:焦虑|烦恼|心事)/,
  /紧绷.{0,8}(?:舒展|放松)/,
  /随心(?:漫步|而行)|随性而行/,
  /吹吹?(?:晚风|风)/,
  /细碎的美好|捕捉.{0,6}美好/,
  /放空自己|好好放空/,
  /积蓄力量|重新出发/,
  /从容面对|往后的日常/,
  /感受.{0,8}(?:生活|城市|美好)/,
  /奔赴(?:山海|远方|目的地)/,
  /岁月静好|不负(?:时光|自己)|治愈自己/,
];

function isGenericPhrase(value) {
  return GENERIC_PATTERNS.some((pattern) => pattern.test(value));
}

function isWeakMetadataAnchor(value) {
  const remainder = value
    .replace(/\d{1,4}年|\d{1,2}月|\d{1,2}日|星期[一二三四五六日天]|周[一二三四五六日天]/g, "")
    .replace(/晴|阴|雨|雪|多云|天气|上午|下午|晚上|早上/g, "")
    .replace(/[\s，。！？、:：·-]/g, "");
  return remainder.length < 2;
}

function normalizeEvidenceList(text, value, maxItems) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 80)).filter(Boolean))]
    .filter((item) => text.includes(item))
    .slice(0, maxItems);
}

export function normalizeEvidence(text, raw = {}) {
  const concreteAnchors = normalizeEvidenceList(text, raw.concrete_anchors, 8).filter(
    (item) => !isWeakMetadataAnchor(item) && !isGenericPhrase(item),
  );
  const personalJudgments = normalizeEvidenceList(text, raw.personal_judgments, 6).filter(
    (item) => item.length >= 6 && !isGenericPhrase(item),
  );
  const realChoices = normalizeEvidenceList(text, raw.real_choices, 6).filter(
    (item) => item.length >= 6 && !isGenericPhrase(item),
  );
  const modelGenericPhrases = normalizeEvidenceList(text, raw.generic_phrases, 10);
  const detectedGenericPhrases = GENERIC_PATTERNS.filter((pattern) => pattern.test(text)).map(
    (pattern) => pattern.source,
  );

  return {
    concreteAnchors,
    personalJudgments,
    realChoices,
    genericCount: Math.max(modelGenericPhrases.length, detectedGenericPhrases.length),
  };
}

export function calibrateDimensions(text, rawDimensions = {}, rawEvidence = {}) {
  const dimensions = normalizeDimensions(rawDimensions);
  const evidence = normalizeEvidence(text, rawEvidence);

  if (evidence.concreteAnchors.length === 0) {
    dimensions.personal_anchor = Math.min(dimensions.personal_anchor, 30);
    dimensions.specific_detail = Math.min(dimensions.specific_detail, 30);
  }
  if (evidence.personalJudgments.length === 0) {
    dimensions.judgment = Math.min(dimensions.judgment, 35);
  }
  if (evidence.realChoices.length === 0) {
    dimensions.choice = Math.min(dimensions.choice, 30);
  }
  if (evidence.genericCount >= 2) {
    dimensions.voice = Math.min(dimensions.voice, 40);
  }
  if (evidence.genericCount >= 4) {
    dimensions.voice = Math.min(dimensions.voice, 30);
  }

  return { dimensions, evidence };
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

function summaryForScore(score, modelSummary) {
  if (score < 30) return "文字完整，但还看不到不可替换的个人经历、判断或取舍。";
  if (score < 50) return "有一点情绪方向，但多数表达换个人也能成立。";
  if (score < 70) return "已经出现个人信号，再补具体场景和取舍会更像你。";
  return cleanText(modelSummary, 120) || "文本里已经能看到较清楚的个人信息和选择。";
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
  const modelResponse = await runZhipu(
    [
      {
        role: "system",
        content: `你是“含人量”文本分析器。含人量不是人工撰写比例，也不是AI生成率，而是文本中来自作者本人、换个人就不容易原样成立的信息密度。
依据五项分别评分：个人锚点、具体细节、判断立场、选择取舍、表达指纹。只分析文本呈现出的信号，不能声称验证经历真假。不要因为姓名、地址等隐私而加分；不要奖励故意口语化、错别字、堆砌数字或流畅文艺的语气。正式通知等文本含人量低不代表质量差。
必须严格遵守以下证据门槛：
1. 日期、星期、天气和“我”字只能算弱元数据，单独出现时个人锚点和具体细节都不得超过30分。
2. “松弛、烟火气、抛开焦虑、随心漫步、吹晚风、细碎美好、放空自己、积蓄力量、从容面对”等氛围词和万能感悟属于泛化表达，不是具体经历。
3. 个人判断必须包含作者明确赞成或反对什么，最好有理由、比较或反常识；“好好生活、重新出发”不算判断。
4. 选择取舍必须出现真实备选项、放弃了什么、保留了什么或承担什么代价；“随心、放空、慢慢走”不算选择。
5. 表达流畅、抒情或像朋友圈文案不等于表达指纹；只有难以换到别人身上的措辞、视角或节奏才加分。
evidence中的短语必须从原文逐字摘取。concrete_anchors排除日期天气和泛化景物；personal_judgments排除万能结论；real_choices排除抽象生活态度；generic_phrases要主动列出套话。
对每个句子ID给出等级：human=明显属于作者，potential=有个人方向但可更具体，generic=泛化或谁都能说。根据最缺失的维度提出两个具体、容易回答、与原文直接相关的问题。
必须只返回一个JSON对象，不要Markdown。字段和层级严格遵循：${JSON.stringify(analysisShape)}。assessments必须覆盖用户提供的每个句子ID，questions必须恰好两项。全部使用简体中文。`,
      },
      { role: "user", content: `请分析以下编号句子：\n${JSON.stringify(numberedSentences)}` },
    ],
    1100,
  );
  const modelData = modelResponse.data;

  const calibration = calibrateDimensions(text, modelData.dimensions, modelData.evidence);
  const dimensions = calibration.dimensions;
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
    summary: summaryForScore(score, modelData.summary),
    dimensions,
    segments: sentences.map((sentence, id) => {
      const assessment = assessments.get(id);
      const modelLevel = ["human", "potential", "generic"].includes(assessment?.level)
        ? assessment.level
        : "generic";
      const hasEvidence = [
        ...calibration.evidence.concreteAnchors,
        ...calibration.evidence.personalJudgments,
        ...calibration.evidence.realChoices,
      ].some((item) => sentence.includes(item));
      const genericWithoutEvidence = isGenericPhrase(sentence) && !hasEvidence;
      return {
        text: sentence,
        level: genericWithoutEvidence ? "generic" : modelLevel === "human" && !hasEvidence ? "potential" : modelLevel,
        reason: genericWithoutEvidence
          ? "主要是常见氛围或情绪表达，换个人也能成立。"
          : cleanText(assessment?.reason, 100),
      };
    }),
    questions,
    model: modelResponse.model,
  };
}

export async function enrichText(text, answers) {
  const modelResponse = await runZhipu(
    [
      {
        role: "system",
        content: `你是“含人量”整理助手。只能使用原文和用户回答里已经出现的事实、经历、判断和措辞，绝对不能编造人物、数字、场景、感受或结果。把补充内容自然整理回原文，尽量保持作者原来的语气和篇幅。随后按个人锚点、具体细节、判断立场、选择取舍、表达指纹五项分别评分。这不是AI生成率，也不是事实核验。
评分必须遵守同样的证据门槛：日期天气不是强个人锚点；流畅抒情不是表达指纹；万能感悟不是个人判断；没有具体备选项或代价就不算选择取舍。evidence中的所有短语必须逐字出现在revised_text中，并主动标出仍存在的generic_phrases。
必须只返回一个JSON对象，不要Markdown。字段和层级严格遵循：${JSON.stringify(enrichmentShape)}。全部使用简体中文。`,
      },
      {
        role: "user",
        content: `原文：\n${text}\n\n用户回答：\n${answers.map((answer, index) => `${index + 1}. ${answer}`).join("\n")}`,
      },
    ],
    1200,
  );
  const modelData = modelResponse.data;

  const revisedText = cleanText(modelData.revised_text, 3000);
  const calibration = calibrateDimensions(revisedText, modelData.dimensions, modelData.evidence);
  const dimensions = calibration.dimensions;
  const score = scoreDimensions(dimensions);
  return {
    score,
    label: labelForScore(score),
    summary: summaryForScore(score, modelData.summary),
    dimensions,
    revisedText,
    usedDetails: Array.isArray(modelData.used_details)
      ? modelData.used_details.slice(0, 2).map((item) => cleanText(item, 120))
      : [],
    model: modelResponse.model,
  };
}

export function publicError(error) {
  if (error?.statusCode === 503) return { status: 503, message: "AI 服务正在配置，请稍后再试。" };
  if (error?.statusCode === 429) return { status: 429, message: "现在体验的人有点多，请稍后再试。" };
  return { status: 500, message: "AI 暂时没有完成分析，请稍后再试。" };
}
