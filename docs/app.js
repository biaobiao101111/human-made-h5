const API_BASE_URL = "https://zhipu-api.vercel.app/api";

const state = {
  phase: "input",
  text: "",
  submittedText: "",
  answers: ["", ""],
  analysis: null,
  enrichment: null,
  error: "",
  loadingText: "AI 正在找你",
};

const stage = document.querySelector("#stage");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
        <textarea maxlength="2000" placeholder="在这里粘贴一段文字……" aria-label="待检测文字">${escapeHtml(state.text)}</textarea>
        <span class="count">${state.text.length}/2000</span>
      </div>
      ${state.error ? `<p class="error-message" role="alert">${escapeHtml(state.error)}</p>` : ""}
      <button class="primary-button" type="button" ${state.text.trim().length >= 20 ? "" : "disabled"}>开始检测</button>
      <p class="privacy-note">文字会发送给 AI 分析，本站不保存正文。</p>
    </div>`;

  const textarea = stage.querySelector("textarea");
  const button = stage.querySelector(".primary-button");
  textarea.addEventListener("input", (event) => {
    state.text = event.target.value;
    state.error = "";
    stage.querySelector(".count").textContent = `${state.text.length}/2000`;
    button.disabled = state.text.trim().length < 20;
  });
  button.addEventListener("click", detect);
}

async function detect() {
  const clean = state.text.trim();
  if (clean.length < 20) return;
  state.submittedText = clean;
  state.error = "";
  state.loadingText = "AI 正在找你";
  state.phase = "loading";
  render();

  try {
    state.analysis = await apiRequest("/analyze", { text: clean });
    state.phase = "result";
  } catch (error) {
    state.error = error.message;
    state.phase = "input";
  }
  render();
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
      (segment) =>
        `<span class="segment ${segment.level}" title="${escapeHtml(segment.reason)}">${escapeHtml(segment.text)}</span>`,
    )
    .join("");
}

function renderResult() {
  stage.innerHTML = `
    <div class="stage result-stage" aria-live="polite">
      <section class="score-block">
        <span>含人量</span>
        <strong>${state.analysis.score}</strong>
        <p>${escapeHtml(state.analysis.label)}</p>
        ${state.analysis.summary ? `<small>${escapeHtml(state.analysis.summary)}</small>` : ""}
      </section>
      <section class="heatmap" aria-label="文字含人量高亮结果">
        <div class="heatmap-copy">${heatmapHtml()}</div>
        <div class="legend" aria-label="高亮说明">
          <span><i class="dot human-dot"></i>有你</span>
          <span><i class="dot potential-dot"></i>可再具体</span>
          <span><i class="dot generic-dot"></i>谁都能说</span>
        </div>
      </section>
      <button class="primary-button" id="increase" type="button">增加含人量</button>
      <button class="text-button" id="reset" type="button">再测一段</button>
      <p class="disclaimer">AI 动态评估，不是生成率或事实核验。</p>
    </div>`;
  stage.querySelector("#increase").addEventListener("click", () => {
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
        <div><h2>把你加回来</h2><p>${state.analysis.score} → ?</p></div>
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
      <button class="primary-button" id="finish" type="button" ${state.answers.every((answer) => answer.trim()) ? "" : "disabled"}>把我加回来</button>
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
      <section class="score-block">
        <span>含人量</span>
        <div class="score-change"><del>${state.analysis.score}</del><strong>${state.enrichment.score}</strong></div>
        <p>${escapeHtml(state.enrichment.label)}</p>
        ${state.enrichment.summary ? `<small>${escapeHtml(state.enrichment.summary)}</small>` : ""}
      </section>
      <section class="heatmap" aria-label="增加含人量后的文字">
        <div class="heatmap-copy revised-copy">${escapeHtml(state.enrichment.revisedText)}</div>
      </section>
      <button class="primary-button" id="reset" type="button">再测一段</button>
      <p class="disclaimer">只整理你提供的内容，不编造经历。</p>
    </div>`;
  stage.querySelector("#reset").addEventListener("click", reset);
}

function reset() {
  state.phase = "input";
  state.text = "";
  state.submittedText = "";
  state.answers = ["", ""];
  state.analysis = null;
  state.enrichment = null;
  state.error = "";
  render();
}

function render() {
  if (state.phase === "loading") return renderLoading();
  if (state.phase === "result") return renderResult();
  if (state.phase === "questions") return renderQuestions();
  if (state.phase === "improved") return renderImproved();
  return renderInput();
}

render();
