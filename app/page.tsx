"use client";

import { useState } from "react";

const API_BASE_URL = "https://human-made-ai.WORKERS_SUBDOMAIN.workers.dev";

type Segment = { text: string; level: "human" | "potential" | "generic"; reason: string };
type Question = { question: string; placeholder: string; target: string };
type Analysis = {
  score: number;
  label: string;
  summary: string;
  segments: Segment[];
  questions: Question[];
};
type Enrichment = {
  score: number;
  label: string;
  summary: string;
  revisedText: string;
};
type Phase = "input" | "loading" | "result" | "questions" | "improved";

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
  const [error, setError] = useState("");
  const [loadingText, setLoadingText] = useState("AI 正在找你");

  async function detect() {
    const clean = text.trim();
    if (clean.length < 20) return;
    setSubmittedText(clean);
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
        <header className="brand"><h1>含人量检测</h1><p>HUMAN MADE</p></header>

        {phase === "input" && (
          <div className="stage stage-input">
            <div className="input-card">
              <textarea value={text} maxLength={2000} onChange={(event) => { setText(event.target.value); setError(""); }} placeholder="在这里粘贴一段文字……" aria-label="待检测文字" />
              <span className="count">{text.length}/2000</span>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            <button type="button" className="primary-button" disabled={text.trim().length < 20} onClick={detect}>开始检测</button>
            <p className="privacy-note">文字会发送给 AI 分析，本站不保存正文。</p>
          </div>
        )}

        {phase === "loading" && (
          <div className="stage loading-stage" role="status" aria-live="polite"><div className="scanner" aria-hidden="true"><span /></div><p>{loadingText}</p></div>
        )}

        {phase === "result" && analysis && (
          <div className="stage result-stage" aria-live="polite">
            <section className="score-block"><span>含人量</span><strong>{analysis.score}</strong><p>{analysis.label}</p>{analysis.summary && <small>{analysis.summary}</small>}</section>
            <section className="heatmap" aria-label="文字含人量高亮结果">
              <div className="heatmap-copy">{analysis.segments.map((segment, index) => <span key={`${index}-${segment.text}`} className={`segment ${segment.level}`} title={segment.reason}>{segment.text}</span>)}</div>
              <div className="legend" aria-label="高亮说明"><span><i className="dot human-dot" />有你</span><span><i className="dot potential-dot" />可再具体</span><span><i className="dot generic-dot" />谁都能说</span></div>
            </section>
            <button type="button" className="primary-button" onClick={() => setPhase("questions")}>增加含人量</button>
            <button type="button" className="text-button" onClick={reset}>再测一段</button>
            <p className="disclaimer">AI 动态评估，不是生成率或事实核验。</p>
          </div>
        )}

        {phase === "questions" && analysis && (
          <div className="stage question-stage">
            <div className="question-heading"><button type="button" className="back-button" onClick={() => { setError(""); setPhase("result"); }} aria-label="返回检测结果">←</button><div><h2>把你加回来</h2><p>{analysis.score} → ?</p></div></div>
            {analysis.questions.map((item, index) => (
              <label className="question-card" key={`${index}-${item.question}`}><span>{index + 1}</span><strong>{item.question}</strong><textarea value={answers[index]} maxLength={240} onChange={(event) => updateAnswer(index, event.target.value)} placeholder={item.placeholder} /></label>
            ))}
            {error && <p className="error-message" role="alert">{error}</p>}
            <button type="button" className="primary-button" disabled={answers.some((answer) => !answer.trim())} onClick={enrichText}>把我加回来</button>
          </div>
        )}

        {phase === "improved" && analysis && enrichment && (
          <div className="stage result-stage improved-stage" aria-live="polite">
            <section className="score-block"><span>含人量</span><div className="score-change"><del>{analysis.score}</del><strong>{enrichment.score}</strong></div><p>{enrichment.label}</p>{enrichment.summary && <small>{enrichment.summary}</small>}</section>
            <section className="heatmap" aria-label="增加含人量后的文字"><div className="heatmap-copy revised-copy">{enrichment.revisedText}</div></section>
            <button type="button" className="primary-button" onClick={reset}>再测一段</button>
            <p className="disclaimer">只整理你提供的内容，不编造经历。</p>
          </div>
        )}
      </section>
    </main>
  );
}
