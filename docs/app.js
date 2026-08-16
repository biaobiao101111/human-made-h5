import { quickAnalyzeText } from "./quick-analysis.js?v=4";

const API_BASE_URL = "https://zhipu-api.vercel.app/api";

const state = {
  phase: "input",
  text: "",
  submittedText: "",
  answers: ["", ""],
  analysis: null,
  enrichment: null,
  error: "",
  analysisStatus: "idle",
  loadingText: "AI 正在找你",
};

const stage = document.querySelector("#stage");
let reviewSequence = 0;

const DIMENSIONS = [
  ["personal_anchor", "个人锚点"],
  ["specific_detail", "具体细节"],
  ["judgment", "判断立场"],
  ["choice", "选择取舍"],
  ["voice", "表达指纹"],
];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dimensionValues(dimensions = {}) {
  return DIMENSIONS.map(([key]) => Math.max(0, Math.min(100, Number(dimensions[key]) || 0)));
}

function dimensionRowsHtml(current, previous) {
  return DIMENSIONS.map(([key, label]) => {
    const value = Math.round(Number(current?.[key]) || 0);
    if (!previous) {
      return `<li><span>${label}</span><strong>${value}</strong></li>`;
    }
    const oldValue = Math.round(Number(previous?.[key]) || 0);
    const delta = value - oldValue;
    return `<li><span>${label}</span><div><del>${oldValue}</del><i>→</i><strong>${value}</strong>${delta > 0 ? `<em>+${delta}</em>` : ""}</div></li>`;
  }).join("");
}

function radarCardHtml(current, previous) {
  const description = DIMENSIONS.map(([key, label]) => `${label}${Math.round(Number(current?.[key]) || 0)}分`).join("，");
  return `
    <section class="radar-card" aria-label="含人量五维评分">
      <div class="section-heading">
        <div><span>五维画像</span><h2>${previous ? "补回了哪部分的你" : "哪里最像你"}</h2></div>
        <div class="chart-legend">${previous ? '<i class="before-line"></i>补充前' : ""}<i class="after-line"></i>${previous ? "补充后" : "本次"}</div>
      </div>
      <canvas class="radar-canvas" role="img" aria-label="${escapeHtml(description)}"></canvas>
      <ul class="dimension-list">${dimensionRowsHtml(current, previous)}</ul>
    </section>`;
}

function drawRadar(canvas, current, previous) {
  if (!canvas) return;
  const width = Math.max(280, canvas.clientWidth || 320);
  const height = 248;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = 122;
  const radius = Math.min(82, width * 0.25);
  const pointAt = (index, scale) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / DIMENSIONS.length;
    return [centerX + Math.cos(angle) * radius * scale, centerY + Math.sin(angle) * radius * scale];
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

  const drawDataset = (dimensions, stroke, fill, dashed = false) => {
    const values = dimensionValues(dimensions);
    context.beginPath();
    values.forEach((value, index) => {
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
      values.forEach((value, index) => {
        const [x, y] = pointAt(index, value / 100);
        context.beginPath();
        context.arc(x, y, 3, 0, Math.PI * 2);
        context.fillStyle = "#d95835";
        context.fill();
      });
    }
  };

  if (previous) drawDataset(previous, "rgba(113,104,95,.7)", "rgba(113,104,95,.035)", true);
  drawDataset(current, "#d95835", "rgba(217,88,53,.16)");
}

function bindSegmentReasons() {
  const reasonBox = stage.querySelector(".segment-reason");
  if (!reasonBox) return;
  stage.querySelectorAll("[data-segment]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.segment);
      const segment = state.analysis.segments[index];
      stage.querySelectorAll("[data-segment]").forEach((item) => item.setAttribute("aria-pressed", "false"));
      button.setAttribute("aria-pressed", "true");
      reasonBox.innerHTML = `<span>AI 观察</span><p>${escapeHtml(segment.reason || "这句话还可以补充更具体的个人信息。")}</p>`;
      reasonBox.hidden = false;
    });
  });
}

async function apiRequest(path, payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "AI 暂时没有完成分析，请稍后再试。");
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("分析等待太久了，请再试一次。");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderInput() {
  stage.innerHTML = `
    <div class="stage stage-input">
      <div class="input-card">
        <div class="input-meta"><span>你的文字</span>${state.text ? '<button id="clear" type="button">清空</button>' : ""}</div>
        <textarea maxlength="2000" placeholder="在这里粘贴一段文字……" aria-label="待检测文字">${escapeHtml(state.text)}</textarea>
        <span class="count">${state.text.length}/2000</span>
      </div>
      ${state.error ? `<p class="error-message" role="alert">${escapeHtml(state.error)}</p>` : ""}
      <button class="primary-button" type="button" ${state.text.trim() ? "" : "disabled"}><span>开始检测</span><i>→</i></button>
      <p class="privacy-note">先在本机快速初筛，再发送给 AI 复核；本站不保存正文。</p>
    </div>`;

  const textarea = stage.querySelector("textarea");
  const button = stage.querySelector(".primary-button");
  textarea.addEventListener("input", (event) => {
    state.text = event.target.value;
    state.error = "";
    stage.querySelector(".count").textContent = `${state.text.length}/2000`;
    button.disabled = !state.text.trim();
  });
  stage.querySelector("#clear")?.addEventListener("click", () => {
    state.text = "";
    render();
  });
  button.addEventListener("click", detect);
}

async function detect() {
  const clean = state.text.trim();
  if (!clean) return;
  if (clean.length < 5) {
    state.error = "再多写几个字，至少 5 个字才能判断。";
    render();
    return;
  }
  state.submittedText = clean;
  state.error = "";
  state.analysis = quickAnalyzeText(clean);
  state.analysisStatus = "reviewing";
  state.phase = "result";
  render();
  const requestId = ++reviewSequence;
  void reviewAnalysis(clean, requestId);
}

async function reviewAnalysis(text, requestId) {
  try {
    const analysis = await apiRequest("/analyze", { text });
    if (requestId !== reviewSequence) return;
    state.analysis = analysis;
    state.analysisStatus = "complete";
  } catch (error) {
    if (requestId !== reviewSequence) return;
    state.analysisStatus = "failed";
    state.error = error.message;
  }
  if (state.phase === "result") renderResult();
}

function retryReview() {
  if (state.analysisStatus === "reviewing") return;
  state.error = "";
  state.analysisStatus = "reviewing";
  renderResult();
  const requestId = ++reviewSequence;
  void reviewAnalysis(state.submittedText, requestId);
}

function renderLoading() {
  stage.innerHTML = `
    <div class="stage loading-stage" role="status" aria-live="polite">
      <div class="scanner" aria-hidden="true"><span></span></div>
      <p>${escapeHtml(state.loadingText)}</p>
    </div>`;
}

function heatmapHtml() {
  return state.analysis.segments
    .map(
      (segment, index) =>
        `<button type="button" class="segment ${segment.level}" data-segment="${index}" aria-pressed="false">${escapeHtml(segment.text)}</button>`,
    )
    .join("");
}

function reviewStatusHtml() {
  if (state.analysisStatus === "complete") {
    return '<div class="review-status complete"><i>✓</i><span><strong>AI 复核完成</strong>分数和追问已更新</span></div>';
  }
  if (state.analysisStatus === "failed") {
    return `<div class="review-status failed"><i>!</i><span><strong>当前显示快速初筛</strong>免费 AI 暂时排队，可稍后重试</span><button id="retry-review" type="button">重新复核</button></div>`;
  }
  return '<div class="review-status reviewing"><i></i><span><strong>快速初筛已完成</strong>AI 正在后台复核，不用停在等待页</span></div>';
}

function renderResult() {
  const isReviewing = state.analysisStatus === "reviewing";
  stage.innerHTML = `
    <div class="stage result-stage" aria-live="polite">
      ${reviewStatusHtml()}
      <section class="score-block score-card">
        <span>含人量 · ${state.analysisStatus === "complete" ? "AI 复核" : "快速初筛"}</span>
        <div class="score-value"><strong>${state.analysis.score}</strong><i>/ 100</i></div>
        <p>${escapeHtml(state.analysis.label)}</p>
        ${state.analysis.summary ? `<small>${escapeHtml(state.analysis.summary)}</small>` : ""}
      </section>
      ${radarCardHtml(state.analysis.dimensions)}
      <section class="heatmap" aria-label="文字含人量高亮结果">
        <div class="section-heading compact"><div><span>文字热区</span><h2>哪句话里有你</h2></div><small>轻点查看</small></div>
        <div class="heatmap-copy">${heatmapHtml()}</div>
        <div class="segment-reason" hidden></div>
        <div class="legend" aria-label="高亮说明">
          <span><i class="dot human-dot"></i>有你</span>
          <span><i class="dot potential-dot"></i>可再具体</span>
          <span><i class="dot generic-dot"></i>谁都能说</span>
        </div>
      </section>
      <button class="primary-button" id="increase" type="button" ${isReviewing ? "disabled" : ""}><span>${isReviewing ? "AI 复核后可增加" : "增加含人量"}</span><i>→</i></button>
      <button class="text-button" id="reset" type="button">再测一段</button>
      <p class="disclaimer">AI 动态评估，不是生成率或事实核验。</p>
    </div>`;
  drawRadar(stage.querySelector(".radar-canvas"), state.analysis.dimensions);
  bindSegmentReasons();
  stage.querySelector("#retry-review")?.addEventListener("click", retryReview);
  stage.querySelector("#increase").addEventListener("click", () => {
    if (state.analysisStatus === "reviewing") return;
    state.error = "";
    state.phase = "questions";
    render();
  });
  stage.querySelector("#reset").addEventListener("click", reset);
}

function renderQuestions() {
  const questions = state.analysis.questions;
  stage.innerHTML = `
    <div class="stage question-stage">
      <div class="question-heading">
        <button type="button" class="back-button" aria-label="返回检测结果">←</button>
        <div><span>第 2 步 · 回答两个问题</span><h2>把你加回来</h2><p>${state.analysis.score} → ?</p></div>
      </div>
      ${questions
        .map(
          (item, index) => `
            <label class="question-card">
              <span>${index + 1}</span><strong>${escapeHtml(item.question)}</strong>
              <textarea data-answer="${index}" maxlength="240" placeholder="${escapeHtml(item.placeholder)}">${escapeHtml(state.answers[index])}</textarea>
            </label>`,
        )
        .join("")}
      ${state.error ? `<p class="error-message" role="alert">${escapeHtml(state.error)}</p>` : ""}
      <button class="primary-button" id="finish" type="button" ${state.answers.every((answer) => answer.trim()) ? "" : "disabled"}><span>把我加回来</span><i>→</i></button>
    </div>`;

  const finish = stage.querySelector("#finish");
  stage.querySelector(".back-button").addEventListener("click", () => {
    state.error = "";
    state.phase = "result";
    render();
  });
  stage.querySelectorAll("[data-answer]").forEach((textarea) => {
    textarea.addEventListener("input", (event) => {
      state.answers[Number(event.target.dataset.answer)] = event.target.value;
      state.error = "";
      finish.disabled = state.answers.some((answer) => !answer.trim());
    });
  });
  finish.addEventListener("click", enrichText);
}

async function enrichText() {
  if (state.answers.some((answer) => !answer.trim())) return;
  state.error = "";
  state.loadingText = "正在把你加回来";
  state.phase = "loading";
  render();

  try {
    state.enrichment = await apiRequest("/enrich", {
      text: state.submittedText,
      answers: state.answers,
    });
    state.phase = "improved";
  } catch (error) {
    state.error = error.message;
    state.phase = "questions";
  }
  render();
}

function renderImproved() {
  stage.innerHTML = `
    <div class="stage result-stage improved-stage" aria-live="polite">
      <section class="score-block score-card">
        <span>含人量提升</span>
        <div class="score-change"><del>${state.analysis.score}</del><strong>${state.enrichment.score}</strong></div>
        <p>${escapeHtml(state.enrichment.label)}</p>
        ${state.enrichment.summary ? `<small>${escapeHtml(state.enrichment.summary)}</small>` : ""}
      </section>
      ${radarCardHtml(state.enrichment.dimensions, state.analysis.dimensions)}
      <section class="heatmap" aria-label="增加含人量后的文字">
        <div class="section-heading compact"><div><span>整理结果</span><h2>把你放回文字里</h2></div></div>
        <div class="heatmap-copy revised-copy">${escapeHtml(state.enrichment.revisedText)}</div>
      </section>
      <button class="primary-button" id="reset" type="button"><span>再测一段</span><i>↻</i></button>
      <p class="disclaimer">只整理你提供的内容，不编造经历。</p>
    </div>`;
  drawRadar(stage.querySelector(".radar-canvas"), state.enrichment.dimensions, state.analysis.dimensions);
  stage.querySelector("#reset").addEventListener("click", reset);
}

function reset() {
  reviewSequence += 1;
  state.phase = "input";
  state.text = "";
  state.submittedText = "";
  state.answers = ["", ""];
  state.analysis = null;
  state.enrichment = null;
  state.error = "";
  state.analysisStatus = "idle";
  render();
}

function render() {
  if (state.phase === "loading") renderLoading();
  else if (state.phase === "result") renderResult();
  else if (state.phase === "questions") renderQuestions();
  else if (state.phase === "improved") renderImproved();
  else renderInput();
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

render();
