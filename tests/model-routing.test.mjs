import assert from "node:assert/strict";
import test from "node:test";

import { runZhipu } from "../zhipu-api/lib/human-made.js";

const successfulResponse = () =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

test("uses the faster free model first", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.ZHIPU_API_KEY;
  const requests = [];
  process.env.ZHIPU_API_KEY = "test-key";
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return successfulResponse();
  };

  try {
    const result = await runZhipu([{ role: "user", content: "测试" }], 100);
    assert.equal(result.model, "glm-4-flash-250414");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].thinking, undefined);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ZHIPU_API_KEY;
    else process.env.ZHIPU_API_KEY = originalKey;
  }
});

test("falls back to GLM-4.7-Flash when the fast route is limited", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.ZHIPU_API_KEY;
  const requests = [];
  process.env.ZHIPU_API_KEY = "test-key";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) return new Response("{}", { status: 429 });
    return successfulResponse();
  };

  try {
    const result = await runZhipu([{ role: "user", content: "测试" }], 100);
    assert.equal(result.model, "glm-4.7-flash");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].thinking, { type: "disabled" });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ZHIPU_API_KEY;
    else process.env.ZHIPU_API_KEY = originalKey;
  }
});
