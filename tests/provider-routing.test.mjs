import assert from "node:assert/strict";
import test from "node:test";

import { activeModel, resolveModelProvider, runModel } from "../zhipu-api/lib/human-made.js";

test("uses DeepSeek V4 Flash when its key is configured", () => {
  const provider = resolveModelProvider({
    DEEPSEEK_API_KEY: "deepseek-test-key",
    ZHIPU_API_KEY: "zhipu-test-key",
  });

  assert.equal(provider.id, "deepseek");
  assert.equal(provider.model, "deepseek-v4-flash");
  assert.equal(provider.endpoint, "https://api.deepseek.com/chat/completions");
  assert.equal(activeModel({ DEEPSEEK_API_KEY: "deepseek-test-key" }), "deepseek-v4-flash");
});

test("keeps the existing Zhipu model as an unconfigured fallback", () => {
  const provider = resolveModelProvider({ ZHIPU_API_KEY: "zhipu-test-key" });

  assert.equal(provider.id, "zhipu");
  assert.equal(provider.model, "glm-4.7-flash");
});

test("reports no provider when neither key exists", () => {
  assert.equal(resolveModelProvider({}), null);
});

test("requests DeepSeek in non-thinking JSON mode", async () => {
  const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const originalZhipuKey = process.env.ZHIPU_API_KEY;
  const originalFetch = globalThis.fetch;
  let capturedRequest;

  process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
  delete process.env.ZHIPU_API_KEY;
  globalThis.fetch = async (url, options) => {
    capturedRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"score":42}' } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await runModel([{ role: "user", content: "只返回JSON" }], 600);
    assert.deepEqual(result, { score: 42 });
    assert.equal(capturedRequest.url, "https://api.deepseek.com/chat/completions");
    assert.equal(capturedRequest.body.model, "deepseek-v4-flash");
    assert.deepEqual(capturedRequest.body.thinking, { type: "disabled" });
    assert.deepEqual(capturedRequest.body.response_format, { type: "json_object" });
    assert.equal(capturedRequest.body.stream, false);
    assert.equal(capturedRequest.body.max_tokens, 600);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
    if (originalZhipuKey === undefined) delete process.env.ZHIPU_API_KEY;
    else process.env.ZHIPU_API_KEY = originalZhipuKey;
  }
});
