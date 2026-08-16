import {
  analyzeText,
  cleanText,
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
    return sendJson(response, await analyzeText(text), 200, validation.origin);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unknown analyze error");
    const output = publicError(error);
    return sendJson(response, { error: output.message }, output.status, validation.origin);
  }
}
