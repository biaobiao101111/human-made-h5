"use client";

import { useMemo, useState } from "react";

type Level = "human" | "potential" | "generic";

type Segment = {
  text: string;
  level: Level;
};

type Analysis = {
  score: number;
  label: string;
  segments: Segment[];
};

const humanSignals = [
  /我|我们|我的|亲自|当时|记得|经历|遇到|发现/,
  /\d+|[一二三四五六七八九十]+(?:点|次|天|年|月|日|分钟|小时)|周[一二三四五六日天]|上午|下午|晚上|凌晨/,
  /我觉得|我认为|在我看来|让我意识到|真正|不是.+而是|更愿意|不认同/,
  /选择|决定|放弃|宁愿|最后|取舍|改成|删掉|留下|拒绝/,
  /紧张|失望|高兴|松了口气|犹豫|后悔|意外|像|仿佛|只想|居然/,
];

const boilerplate =
  /收获了很多|受益匪浅|意义重大|团队协作的重要性|顺利完成|砥砺前行|未来可期|共同努力|不忘初心|再接再厉|提升自己|学到了很多|值得深思/;

function splitSentences(text: string) {
  return text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n/g)?.filter(Boolean) ?? [text];
}

function labelForScore(score: number) {
  return score < 30
    ? "还没看见你"
    : score < 50
      ? "看见一点轮廓"
      : score < 70
        ? "已经能听见你"
        : score < 85
          ? "很像你会说的话"
          : "这里面很有你";
}

function analyzeText(text: string): Analysis {
  const sentences = splitSentences(text.trim());
  const dimensions = new Set<number>();
  let signalTotal = 0;
  let humanSentences = 0;
  let boilerplateCount = 0;

  const segments = sentences.map((sentence) => {
    if (sentence === "\n") return { text: sentence, level: "generic" as Level };

    let strength = 0;
    humanSignals.forEach((signal, index) => {
      if (signal.test(sentence)) {
        strength += 1;
        dimensions.add(index);
      }
    });

    const isBoilerplate = boilerplate.test(sentence);
    if (isBoilerplate) boilerplateCount += 1;
    signalTotal += strength;
    if (strength >= 2 && !isBoilerplate) humanSentences += 1;

    const level: Level = isBoilerplate
      ? "generic"
      : strength >= 2
        ? "human"
        : strength === 1
          ? "potential"
          : "generic";

    return { text: sentence, level };
  });

  const count = Math.max(1, sentences.filter((sentence) => sentence !== "\n").length);
  const personalRatio = humanSentences / count;
  const signalDensity = Math.min(1, signalTotal / (count * 3));
  const diversity = dimensions.size / humanSignals.length;
  const boilerRatio = boilerplateCount / count;
  const lengthConfidence = Math.min(1, text.trim().length / 120);
  const raw =
    12 +
    personalRatio * 28 +
    signalDensity * 30 +
    diversity * 28 -
    boilerRatio * 18;
  const score = Math.round(Math.max(8, Math.min(94, raw * (0.72 + lengthConfidence * 0.28))));
  const label = labelForScore(score);

  return { score, label, segments };
}

export default function Home() {
  const [text, setText] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [answers, setAnswers] = useState(["", ""]);
  const [phase, setPhase] = useState<
    "input" | "loading" | "result" | "questions" | "improved"
  >("input");
  const analysis = useMemo(
    () => (submittedText ? analyzeText(submittedText) : null),
    [submittedText],
  );
  const improvedScore = useMemo(() => {
    if (!analysis) return 0;
    const answerLength = answers.reduce((total, answer) => total + answer.trim().length, 0);
    return Math.min(94, analysis.score + 12 + Math.min(22, Math.round(answerLength / 4)));
  }, [analysis, answers]);

  function detect() {
    const clean = text.trim();
    if (!clean) return;
    setSubmittedText(clean);
    setPhase("loading");
    window.setTimeout(() => setPhase("result"), 760);
  }

  function reset() {
    setPhase("input");
    setSubmittedText("");
    setAnswers(["", ""]);
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>("textarea")?.focus(), 0);
  }

  function updateAnswer(index: number, value: string) {
    setAnswers((current) => current.map((answer, answerIndex) => (answerIndex === index ? value : answer)));
  }

  return (
    <main className="app-shell">
      <section className="phone-page" aria-label="含人量检测">
        <header className="brand">
          <h1>含人量检测</h1>
          <p>HUMAN MADE</p>
        </header>

        {phase === "input" && (
          <div className="stage stage-input">
            <div className="input-card">
              <textarea
                value={text}
                maxLength={2000}
                onChange={(event) => setText(event.target.value)}
                placeholder="在这里粘贴一段文字……"
                aria-label="待检测文字"
              />
              <span className="count">{text.length}/2000</span>
            </div>

            <button type="button" className="primary-button" disabled={!text.trim()} onClick={detect}>
              开始检测
            </button>
          </div>
        )}

        {phase === "loading" && (
          <div className="stage loading-stage" role="status" aria-live="polite">
            <div className="scanner" aria-hidden="true">
              <span />
            </div>
            <p>正在找你</p>
          </div>
        )}

        {phase === "result" && analysis && (
          <div className="stage result-stage" aria-live="polite">
            <section className="score-block">
              <span>含人量</span>
              <strong>{analysis.score}</strong>
              <p>{analysis.label}</p>
            </section>

            <section className="heatmap" aria-label="文字含人量高亮结果">
              <div className="heatmap-copy">
                {analysis.segments.map((segment, index) => (
                  <span key={`${segment.text}-${index}`} className={`segment ${segment.level}`}>
                    {segment.text}
                  </span>
                ))}
              </div>
              <div className="legend" aria-label="高亮说明">
                <span><i className="dot human-dot" />有你</span>
                <span><i className="dot potential-dot" />可再具体</span>
                <span><i className="dot generic-dot" />谁都能说</span>
              </div>
            </section>

            <button type="button" className="primary-button" onClick={() => setPhase("questions")}>
              增加含人量
            </button>
            <button type="button" className="text-button" onClick={reset}>再测一段</button>
            <p className="disclaimer">不是 AI 生成率，只看文字里的个人痕迹。</p>
          </div>
        )}

        {phase === "questions" && analysis && (
          <div className="stage question-stage">
            <div className="question-heading">
              <button type="button" className="back-button" onClick={() => setPhase("result")} aria-label="返回检测结果">←</button>
              <div>
                <h2>把你加回来</h2>
                <p>{analysis.score} → ?</p>
              </div>
            </div>

            <label className="question-card">
              <span>1</span>
              <strong>这件事里，哪一个具体瞬间你现在还记得？</strong>
              <textarea
                value={answers[0]}
                maxLength={240}
                onChange={(event) => updateAnswer(0, event.target.value)}
                placeholder="写下真实发生的一幕……"
              />
            </label>

            <label className="question-card">
              <span>2</span>
              <strong>如果只能保留一个判断，你真正想说什么？</strong>
              <textarea
                value={answers[1]}
                maxLength={240}
                onChange={(event) => updateAnswer(1, event.target.value)}
                placeholder="不用完整，像你平时说话就好……"
              />
            </label>

            <button
              type="button"
              className="primary-button"
              disabled={answers.some((answer) => !answer.trim())}
              onClick={() => setPhase("improved")}
            >
              把我加回来
            </button>
          </div>
        )}

        {phase === "improved" && analysis && (
          <div className="stage result-stage improved-stage" aria-live="polite">
            <section className="score-block">
              <span>含人量</span>
              <div className="score-change"><del>{analysis.score}</del><strong>{improvedScore}</strong></div>
              <p>{labelForScore(improvedScore)}</p>
            </section>

            <section className="heatmap" aria-label="增加含人量后的文字">
              <div className="heatmap-copy original-copy">{submittedText}</div>
              <div className="added-copy">
                <p><span>你记得的瞬间</span>{answers[0]}</p>
                <p><span>你真正的判断</span>{answers[1]}</p>
              </div>
            </section>

            <button type="button" className="primary-button" onClick={reset}>再测一段</button>
            <p className="disclaimer">增加的是你提供的内容，不是 AI 编的经历。</p>
          </div>
        )}
      </section>
    </main>
  );
}
