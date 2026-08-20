"use client";

/* The same small, user-supplied raster logo is shared with the static GitHub Pages build. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";

const API_BASE_URL = "https://zhipu-api.vercel.app/api";

type Segment = { text: string; level: "human" | "potential" | "generic"; reason: string };
type Question = { question: string; placeholder: string; target: string };
type Dimensions = {
  personal_anchor: number;
  specific_detail: number;
  judgment: number;
  choice: number;
  voice: number;
};
type Analysis = {
  score: number;
  label: string;
  summary: string;
  dimensions: Dimensions;
  segments: Segment[];
  questions: Question[];
};
type Enrichment = {
  score: number;
  label: string;
  summary: string;
  dimensions: Dimensions;
  revisedText: string;
};
type Phase = "input" | "loading" | "result" | "questions" | "improved";

const DIMENSIONS: Array<[keyof Dimensions, string]> = [
  ["personal_anchor", "个人锚点"],
  ["specific_detail", "具体细节"],
  ["judgment", "判断立场"],
  ["choice", "选择取舍"],
  ["voice", "表达指纹"],
];

function RadarChart({ current, previous }: { current: Dimensions; previous?: Dimensions }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const width = Math.max(280, canvas.clientWidth || 320);
      const height = 248;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = 122;
      const radius = Math.min(82, width * 0.25);
      const pointAt = (index: number, scale: number) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / DIMENSIONS.length;
        return [centerX + Math.cos(angle) * radius * scale, centerY + Math.sin(angle) * radius * scale] as const;
      };

      context.lineJoin = "round";
      for (let level = 1; level <= 5; level += 1) {
        context.beginPath();
        DIMENSIONS.forEach((_, index) => {
          const [x, y] = pointAt(index, level / 5);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
        context.strokeStyle = level === 5 ? "rgba(63,54,46,.22)" : "rgba(63,54,46,.09)";
        context.lineWidth = 1;
        context.stroke();
      }

      DIMENSIONS.forEach(([, label], index) => {
        const [x, y] = pointAt(index, 1);
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.lineTo(x, y);
        context.strokeStyle = "rgba(63,54,46,.1)";
        context.stroke();
        const [labelX, labelY] = pointAt(index, 1.31);
        context.fillStyle = "#71685f";
        context.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
        context.textAlign = labelX < centerX - 8 ? "right" : labelX > centerX + 8 ? "left" : "center";
        context.textBaseline = labelY < centerY ? "bottom" : "top";
        context.fillText(label, labelX, labelY);
      });

      const drawDataset = (values: Dimensions, stroke: string, fill: string, dashed = false) => {
        context.beginPath();
        DIMENSIONS.forEach(([key], index) => {
          const value = Math.max(0, Math.min(100, Number(values[key]) || 0));
          const [x, y] = pointAt(index, value / 100);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
        context.setLineDash(dashed ? [5, 4] : []);
        context.strokeStyle = stroke;
        context.fillStyle = fill;
        context.lineWidth = dashed ? 1.5 : 2;
        context.fill();
        context.stroke();
        context.setLineDash([]);
        if (!dashed) {
          DIMENSIONS.forEach(([key], index) => {
            const [x, y] = pointAt(index, Math.max(0, Math.min(100, Number(values[key]) || 0)) / 100);
            context.beginPath();
            context.arc(x, y, 3, 0, Math.PI * 2);
            context.fillStyle = "#d95835";
            context.fill();
          });
        }
      };

      if (previous) drawDataset(previous, "rgba(113,104,95,.7)", "rgba(113,104,95,.035)", true);
      drawDataset(current, "#d95835", "rgba(217,88,53,.16)");
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [current, previous]);

  const description = DIMENSIONS.map(([key, label]) => `${label}${Math.round(current[key])}分`).join("，");
  return <canvas ref={canvasRef} className="radar-canvas" role="img" aria-label={description} />;
}

function RadarCard({ current, previous }: { current: Dimensions; previous?: Dimensions }) {
  return (
    <section className="radar-card" aria-label="含人量五维评分">
      <div className="section-heading">
        <div><span>五维画像</span><h2>{previous ? "补回了哪部分的你" : "哪里最像你"}</h2></div>
        <div className="chart-legend">{previous && <><i className="before-line" />补充前</>}<i className="after-line" />{previous ? "补充后" : "本次"}</div>
      </div>
      <RadarChart current={current} previous={previous} />
      <ul className="dimension-list">
        {DIMENSIONS.map(([key, label]) => {
          const value = Math.round(current[key]);
          const oldValue = previous ? Math.round(previous[key]) : null;
          const delta = oldValue === null ? 0 : value - oldValue;
          return <li key={key}><span>{label}</span>{oldValue === null ? <strong>{value}</strong> : <div><del>{oldValue}</del><i>→</i><strong>{value}</strong>{delta > 0 && <em>+{delta}</em>}</div>}</li>;
        })}
      </ul>
    </section>
  );
}

async function apiRequest<T>(path: string, payload: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(data.error || "AI 暂时没有完成分析，请稍后再试。");
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("分析等待太久了，请再试一次。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function Home() {
  const [text, setText] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [answers, setAnswers] = useState(["", ""]);
  const [phase, setPhase] = useState<Phase>("input");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [activeSegment, setActiveSegment] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loadingText, setLoadingText] = useState("AI 正在找你");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [phase]);

  async function detect() {
    const clean = text.trim();
    if (!clean) return;
    if (clean.length < 5) {
      setError("再多写几个字，至少 5 个字才能判断。");
      return;
    }
    setSubmittedText(clean);
    setActiveSegment(null);
    setError("");
    setLoadingText("AI 正在找你");
    setPhase("loading");
    try {
      setAnalysis(await apiRequest<Analysis>("/analyze", { text: clean }));
      setPhase("result");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 暂时没有完成分析，请稍后再试。");
      setPhase("input");
    }
  }

  async function enrichText() {
    if (answers.some((answer) => !answer.trim())) return;
    setError("");
    setLoadingText("正在把你加回来");
    setPhase("loading");
    try {
      setEnrichment(await apiRequest<Enrichment>("/enrich", { text: submittedText, answers }));
      setPhase("improved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 暂时没有完成整理，请稍后再试。");
      setPhase("questions");
    }
  }

  function reset() {
    setText("");
    setSubmittedText("");
    setAnswers(["", ""]);
    setAnalysis(null);
    setEnrichment(null);
    setActiveSegment(null);
    setError("");
    setPhase("input");
  }

  function updateAnswer(index: number, value: string) {
    setAnswers((current) => current.map((answer, answerIndex) => (answerIndex === index ? value : answer)));
    setError("");
  }

  return (
    <main className="app-shell">
      <section className="phone-page" aria-label="含人量检测">
        <header className="brand">
          <div className="brand-logo" aria-label="HumanMade 品牌标志">
            <img src="/human-made-logo.jpg" width="1280" height="1280" alt="HumanMade 指纹钢笔品牌标志" />
          </div>
          <div className="brand-title-line">
            <h1>含人量检测</h1>
            <div className="puqi-mark" aria-label="浦柒 AI 观察">浦柒 AI观察</div>
          </div>
        </header>

        {phase === "input" && (
          <div className="stage stage-input">
            <div className="input-card">
              <div className="input-meta"><span>你的文字</span>{text && <button type="button" onClick={() => setText("")}>清空</button>}</div>
              <textarea value={text} maxLength={2000} onChange={(event) => { setText(event.target.value); setError(""); }} placeholder="在这里粘贴一段文字……" aria-label="待检测文字" />
              <span className="count">{text.length}/2000</span>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            <button type="button" className="primary-button" disabled={!text.trim()} onClick={detect}><span>开始检测</span><i>→</i></button>
            <p className="privacy-note">文字会发送给 AI 分析，本站不保存正文。</p>
          </div>
        )}

        {phase === "loading" && (
          <div className="stage loading-stage" role="status" aria-live="polite"><div className="scanner" aria-hidden="true"><span /></div><p>{loadingText}</p></div>
        )}

        {phase === "result" && analysis && (
          <div className="stage result-stage" aria-live="polite">
            <section className="score-block score-card"><span>含人量</span><div className="score-value"><strong>{analysis.score}</strong><i>/ 100</i></div><p>{analysis.label}</p>{analysis.summary && <small>{analysis.summary}</small>}</section>
            <RadarCard current={analysis.dimensions} />
            <section className="heatmap" aria-label="文字含人量高亮结果">
              <div className="section-heading compact"><div><span>文字热区</span><h2>哪句话里有你</h2></div><small>轻点查看</small></div>
              <div className="heatmap-copy">{analysis.segments.map((segment, index) => <button type="button" key={`${index}-${segment.text}`} className={`segment ${segment.level}`} aria-pressed={activeSegment === index} onClick={() => setActiveSegment(index)}>{segment.text}</button>)}</div>
              {activeSegment !== null && <div className="segment-reason"><span>AI 观察</span><p>{analysis.segments[activeSegment]?.reason || "这句话还可以补充更具体的个人信息。"}</p></div>}
              <div className="legend" aria-label="高亮说明"><span><i className="dot human-dot" />有你</span><span><i className="dot potential-dot" />可再具体</span><span><i className="dot generic-dot" />谁都能说</span></div>
            </section>
            <button type="button" className="primary-button" onClick={() => setPhase("questions")}><span>增加含人量</span><i>→</i></button>
            <button type="button" className="text-button" onClick={reset}>再测一段</button>
            <p className="disclaimer">AI 动态评估，不是生成率或事实核验。</p>
          </div>
        )}

        {phase === "questions" && analysis && (
          <div className="stage question-stage">
            <div className="question-heading"><button type="button" className="back-button" onClick={() => { setError(""); setPhase("result"); }} aria-label="返回检测结果">←</button><div><span>第 2 步 · 回答两个问题</span><h2>把你加回来</h2><p>{analysis.score} → ?</p></div></div>
            {analysis.questions.map((item, index) => (
              <label className="question-card" key={`${index}-${item.question}`}><span>{index + 1}</span><strong>{item.question}</strong><textarea value={answers[index]} maxLength={240} onChange={(event) => updateAnswer(index, event.target.value)} placeholder={item.placeholder} /></label>
            ))}
            {error && <p className="error-message" role="alert">{error}</p>}
            <button type="button" className="primary-button" disabled={answers.some((answer) => !answer.trim())} onClick={enrichText}><span>把我加回来</span><i>→</i></button>
          </div>
        )}

        {phase === "improved" && analysis && enrichment && (
          <div className="stage result-stage improved-stage" aria-live="polite">
            <section className="score-block score-card"><span>含人量提升</span><div className="score-change"><del>{analysis.score}</del><strong>{enrichment.score}</strong></div><p>{enrichment.label}</p>{enrichment.summary && <small>{enrichment.summary}</small>}</section>
            <RadarCard current={enrichment.dimensions} previous={analysis.dimensions} />
            <section className="heatmap" aria-label="增加含人量后的文字"><div className="section-heading compact"><div><span>整理结果</span><h2>把你放回文字里</h2></div></div><div className="heatmap-copy revised-copy">{enrichment.revisedText}</div></section>
            <button type="button" className="primary-button" onClick={reset}><span>再测一段</span><i>↻</i></button>
            <p className="disclaimer">只整理你提供的内容，不编造经历。</p>
          </div>
        )}
      </section>
    </main>
  );
}
