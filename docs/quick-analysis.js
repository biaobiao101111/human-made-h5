const DIMENSIONS = [
  ["personal_anchor", "个人锚点"],
  ["specific_detail", "具体细节"],
  ["judgment", "判断立场"],
  ["choice", "选择取舍"],
  ["voice", "表达指纹"],
];

const GENERIC_PATTERNS = [
  /卸下.{0,6}忙碌|出门走走/,
  /风(?:暖暖|轻轻|温柔)|草木.{0,6}(?:葱|绿)/,
  /松弛.{0,4}烟火气|人间烟火|烟火气息/,
  /抛开.{0,8}(?:焦虑|烦恼|心事)|紧绷.{0,8}(?:舒展|放松)/,
  /随心(?:漫步|而行)|随性而行|吹吹?(?:晚风|风)/,
  /细碎的美好|捕捉.{0,6}美好|放空自己|好好放空/,
  /积蓄力量|重新出发|从容面对|往后的日常/,
  /感受.{0,8}(?:生活|城市|美好)|奔赴(?:山海|远方|目的地)/,
  /岁月静好|不负(?:时光|自己)|治愈自己/,
];

const CONCRETE_PATTERN = /\d+(?:次|个|页|分钟|小时|天|元|人|点)|[“”「」]|(?:在|到).{1,10}(?:室|店|路|站|公园|公司|学校|家)|删|改|修|买|拍|问|听到|看到|遇到|拒绝|保留|交给|发给/;
const JUDGMENT_PATTERN = /我(?:觉得|认为|发现|宁愿|不想|更在意)|因为|而不是|其实|但|真正|没有错/;
const CHOICE_PATTERN = /决定|选择|放弃|保留|删掉|宁愿|只能|最后|少做|改成|取舍/;

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function splitSentences(text) {
  return (text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n/g) ?? [text]).filter((piece) => piece.trim());
}

function labelForScore(score) {
  if (score < 30) return "还没看见你";
  if (score < 50) return "看见一点轮廓";
  if (score < 70) return "已经能听见你";
  if (score < 85) return "很像你会说的话";
  return "这里面很有你";
}

function summaryForScore(score) {
  if (score < 30) return "文字完整，但还缺少不可替换的个人证据。";
  if (score < 50) return "有一点你的方向，多数表达还可以更具体。";
  if (score < 70) return "已经出现个人信号，AI 正在继续核对。";
  return "已经看到较清楚的个人细节、判断或取舍。";
}

function questionsForDimensions(dimensions) {
  const questionBank = {
    personal_anchor: { question: "这件事发生在哪里？当时有谁在场？", placeholder: "写下一个只有你知道的现场……", target: "个人锚点" },
    specific_detail: { question: "有没有一个你现在还记得的具体细节？", placeholder: "一个动作、一句话或一个物件……", target: "具体细节" },
    judgment: { question: "这件事里，你真正赞成或反对什么？", placeholder: "别写正确答案，写你自己的判断……", target: "判断立场" },
    choice: { question: "你最后选了什么，又放弃了什么？", placeholder: "写下真实取舍……", target: "选择取舍" },
    voice: { question: "如果只留一句，你最想用自己的话说什么？", placeholder: "像平时说话就好……", target: "表达指纹" },
  };
  return DIMENSIONS
    .map(([key]) => key)
    .sort((left, right) => dimensions[left] - dimensions[right])
    .slice(0, 2)
    .map((key) => questionBank[key]);
}

export function quickAnalyzeText(text) {
  const sentences = splitSentences(text);
  const signals = sentences.map((sentence) => {
    const generic = GENERIC_PATTERNS.some((pattern) => pattern.test(sentence));
    return {
      sentence,
      generic,
      concrete: !generic && CONCRETE_PATTERN.test(sentence),
      judgment: !generic && JUDGMENT_PATTERN.test(sentence),
      choice: !generic && CHOICE_PATTERN.test(sentence),
    };
  });
  const count = (key) => signals.filter((signal) => signal[key]).length;
  const genericRatio = signals.length ? count("generic") / signals.length : 1;
  const concreteCount = count("concrete");
  const judgmentCount = count("judgment");
  const choiceCount = count("choice");

  const dimensions = {
    personal_anchor: clamp(18 + concreteCount * 18 + judgmentCount * 5),
    specific_detail: clamp(14 + concreteCount * 21),
    judgment: clamp(18 + judgmentCount * 22 + choiceCount * 4),
    choice: clamp(14 + choiceCount * 24),
    voice: clamp(30 + judgmentCount * 10 + choiceCount * 6 - genericRatio * 18),
  };

  if (genericRatio >= 0.5) {
    dimensions.personal_anchor = Math.min(dimensions.personal_anchor, 30);
    dimensions.specific_detail = Math.min(dimensions.specific_detail, 30);
    dimensions.judgment = Math.min(dimensions.judgment, 35);
    dimensions.choice = Math.min(dimensions.choice, 30);
    dimensions.voice = Math.min(dimensions.voice, 35);
  }
  if (genericRatio >= 0.75) {
    dimensions.personal_anchor = Math.min(dimensions.personal_anchor, 25);
    dimensions.specific_detail = Math.min(dimensions.specific_detail, 25);
    dimensions.judgment = Math.min(dimensions.judgment, 30);
    dimensions.choice = Math.min(dimensions.choice, 25);
    dimensions.voice = Math.min(dimensions.voice, 30);
  }

  const score = clamp(
    dimensions.personal_anchor * 0.25 +
      dimensions.specific_detail * 0.2 +
      dimensions.judgment * 0.2 +
      dimensions.choice * 0.2 +
      dimensions.voice * 0.15,
  );

  return {
    score,
    label: labelForScore(score),
    summary: summaryForScore(score),
    dimensions,
    segments: signals.map((signal) => ({
      text: signal.sentence,
      level: signal.generic ? "generic" : signal.concrete || signal.judgment || signal.choice ? "human" : "potential",
      reason: signal.generic
        ? "主要是常见氛围或情绪表达，换个人也能成立。"
        : signal.concrete || signal.judgment || signal.choice
          ? "出现了具体动作、个人判断或真实取舍。"
          : "已经有一点个人方向，还可以补充具体证据。",
    })),
    questions: questionsForDimensions(dimensions),
    model: "local-preview",
  };
}
