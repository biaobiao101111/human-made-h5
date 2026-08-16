import {
  cleanText,
  enrichText,
  publicError,
  sendJson,
  validateRequest,
} from "../lib/human-made.js";

export default async function handler(request, response) {
  const validation = validateRequest(request, response);
  if (validation.handled) return;

  try {
    const text = cleanText(request.body?.text, 2000);
    if (text.length < 20) {
      return sendJson(response, { error: "文字太短，请至少输入20个字。" }, 400, validation.origin);
    }
    const answers = Array.isArray(request.body?.answers)
      ? request.body.answers.slice(0, 2).map((answer) => cleanText(answer, 240))
      : [];
    if (answers.length !== 2 || answers.some((answer) => !answer)) {
      return sendJson(response, { error: "请回答两个问题后再继续。" }, 400, validation.origin);
    }
    return sendJson(response, await enrichText(text, answers), 200, validation.origin);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unknown enrich error");
    const output = publicError(error);
    return sendJson(response, { error: output.message }, output.status, validation.origin);
  }
}
