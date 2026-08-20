import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the Human Made detector", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /含人量检测/);
  assert.match(html, /human-made-logo\.jpg/);
  assert.match(html, /HumanMade 指纹钢笔品牌标志/);
  assert.match(html, /浦柒/);
  assert.match(html, /开始检测/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("ships the branded five-dimension experience to GitHub Pages", async () => {
  const [html, script, styles, logo] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../docs/human-made-logo.jpg", import.meta.url)),
  ]);

  assert.match(html, /浦柒/);
  assert.match(html, /human-made-logo\.jpg/);
  assert.ok(logo.length > 10_000);
  assert.match(script, /个人锚点/);
  assert.match(script, /drawRadar/);
  assert.match(script, /补回了哪部分的你/);
  assert.match(styles, /\.radar-card/);
  assert.match(styles, /\.brand-logo img/);
  assert.match(styles, /mix-blend-mode: multiply/);
});
