const humanSignals = [
  /我|我们|我的|亲自|当时|记得|经历|遇到|发现/,
  /\d+|[一二三四五六七八九十]+(?:点|次|天|年|月|日|分钟|小时)|周[一二三四五六日天]|上午|下午|晚上|凌晨/,
  /我觉得|我认为|在我看来|让我意识到|真正|不是.+而是|更愿意|不认同/,
  /选择|决定|放弃|宁愿|最后|取舍|改成|删掉|留下|拒绝/,
  /紧张|失望|高兴|松了口气|犹豫|后悔|意外|像|仿佛|只想|居然/,
];

const boilerplate =
  /收获了很多|受益匪浅|意义重大|团队协作的重要性|顺利完成|砥砺前行|未来可期|共同努力|不忘初心|再接再厉|提升自己|学到了很多|值得深思/;

const state = {
  phase: "input",
  text: "",
  submittedText: "",
  answers: ["", ""],
  analysis: null,
};

const stage = document.querySelector("#stage");

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function splitSentences(text) {
  return text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n/g)?.filter(Boolean) ?? [text];
}

function labelForScore(score) {
  if (score < 30) return "还没看见你";
  if (score < 50) return "看见一点轮廓";
  if (score < 70) return "已经能听见你";
  if (score < 85) return "很像你会说的话";
  return "这里面很有你";
}

function analyzeText(text) {
  const sentences = splitSentences(text.trim());
  const dimensions = new Set();
  let signalTotal = 0;
  let humanSentences = 0;
  let boilerplateCount = 0;

  const segments = sentences.map((sentence) => {
    if (sentence === "\n") return { text: sentence, level: "generic" };
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
    return {
      text: sentence,
      level: isBoilerplate ? "generic" : strength >= 2 ? "human" : strength === 1 ? "potential" : "generic",
    };
  });

  const count = Math.max(1, sentences.filter((sentence) => sentence !== "\n").length);
  const raw =
    12 +
    (humanSentences / count) * 28 +
    Math.min(1, signalTotal / (count * 3)) * 30 +
    (dimensions.size / humanSignals.length) * 28 -
    (boilerplateCount / count) * 18;
  const confidence = Math.min(1, text.trim().length / 120);
  const score = Math.round(Math.max(8, Math.min(94, raw * (0.72 + confidence * 0.28))));
  return { score, label: labelForScore(score), segments };
}

function improvedScore() {
  const answerLength = state.answers.reduce((total, answer) => total + answer.trim().length, 0);
  return Math.min(94, state.analysis.score + 12 + Math.min(22, Math.round(answerLength / 4)));
}

function renderInput() {
  stage.innerHTML = `
    <div class="stage stage-input">
      <div class="input-card">
        <textarea maxlength="2000" placeholder="在这里粘贴一段文字……" aria-label="待检测文字">${escapeHtml(state.text)}</textarea>
        <span class="count">${state.text.length}/2000</span>
      </div>
      <button class="primary-button" type="button" ${state.text.trim() ? "" : "disabled"}>开始检测</button>
    </div>`;

  const textarea = stage.querySelector("textarea");
  const button = stage.querySelector(".primary-button");
  textarea.addEventListener("input", (event) => {
    state.text = event.target.value;
    stage.querySelector(".count").textContent = `${state.text.length}/2000`;
    button.disabled = !state.text.trim();
  });
  button.addEventListener("click", detect);
}

function detect() {
  const clean = state.text.trim();
  if (!clean) return;
  state.submittedText = clean;
  state.analysis = analyzeText(clean);
  state.phase = "loading";
  render();
  window.setTimeout(() => {
    state.phase = "result";
    render();
  }, 760);
}

function renderLoading() {
  stage.innerHTML = `
    <div class="stage loading-stage" role="status" aria-live="polite">
      <div class="scanner" aria-hidden="true"><span></span></div>
      <p>正在找你</p>
    </div>`;
}

function heatmapHtml() {
  return state.analysis.segments
    .map((segment) => `<span class="segment ${segment.level}">${escapeHtml(segment.text)}</span>`)
    .join("");
}

function renderResult() {
  stage.innerHTML = `
    <div class="stage result-stage" aria-live="polite">
      <section class="score-block">
        <span>含人量</span>
        <strong>${state.analysis.score}</strong>
        <p>${state.analysis.label}</p>
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
      <p class="disclaimer">不是 AI 生成率，只看文字里的个人痕迹。</p>
    </div>`;
  stage.querySelector("#increase").addEventListener("click", () => {
    state.phase = "questions";
    render();
  });
  stage.querySelector("#reset").addEventListener("click", reset);
}

function renderQuestions() {
  stage.innerHTML = `
    <div class="stage question-stage">
      <div class="question-heading">
        <button type="button" class="back-button" aria-label="返回检测结果">←</button>
        <div><h2>把你加回来</h2><p>${state.analysis.score} → ?</p></div>
      </div>
      <label class="question-card">
        <span>1</span><strong>这件事里，哪一个具体瞬间你现在还记得？</strong>
        <textarea data-answer="0" maxlength="240" placeholder="写下真实发生的一幕……">${escapeHtml(state.answers[0])}</textarea>
      </label>
      <label class="question-card">
        <span>2</span><strong>如果只能保留一个判断，你真正想说什么？</strong>
        <textarea data-answer="1" maxlength="240" placeholder="不用完整，像你平时说话就好……">${escapeHtml(state.answers[1])}</textarea>
      </label>
      <button class="primary-button" id="finish" type="button" ${state.answers.every((answer) => answer.trim()) ? "" : "disabled"}>把我加回来</button>
    </div>`;

  const finish = stage.querySelector("#finish");
  stage.querySelector(".back-button").addEventListener("click", () => {
    state.phase = "result";
    render();
  });
  stage.querySelectorAll("[data-answer]").forEach((textarea) => {
    textarea.addEventListener("input", (event) => {
      state.answers[Number(event.target.dataset.answer)] = event.target.value;
      finish.disabled = state.answers.some((answer) => !answer.trim());
    });
  });
  finish.addEventListener("click", () => {
    if (state.answers.some((answer) => !answer.trim())) return;
    state.phase = "improved";
    render();
  });
}

function renderImproved() {
  const score = improvedScore();
  stage.innerHTML = `
    <div class="stage result-stage improved-stage" aria-live="polite">
      <section class="score-block">
        <span>含人量</span>
        <div class="score-change"><del>${state.analysis.score}</del><strong>${score}</strong></div>
        <p>${labelForScore(score)}</p>
      </section>
      <section class="heatmap" aria-label="增加含人量后的文字">
        <div class="heatmap-copy original-copy">${escapeHtml(state.submittedText)}</div>
        <div class="added-copy">
          <p><span>你记得的瞬间</span>${escapeHtml(state.answers[0])}</p>
          <p><span>你真正的判断</span>${escapeHtml(state.answers[1])}</p>
        </div>
      </section>
      <button class="primary-button" id="reset" type="button">再测一段</button>
      <p class="disclaimer">增加的是你提供的内容，不是 AI 编的经历。</p>
    </div>`;
  stage.querySelector("#reset").addEventListener("click", reset);
}

function reset() {
  state.phase = "input";
  state.text = "";
  state.submittedText = "";
  state.answers = ["", ""];
  state.analysis = null;
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
