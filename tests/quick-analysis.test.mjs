import assert from "node:assert/strict";
import test from "node:test";

import { quickAnalyzeText } from "../docs/quick-analysis.js";

test("returns an immediate low preview for interchangeable diary copy", () => {
  const result = quickAnalyzeText("8月16日 周六 晴\n难得卸下忙碌出门走走。风暖暖的，街边草木郁郁葱葱，慢慢闲逛，看往来行人，感受城市松弛的烟火气息。暂时抛开生活里的焦虑与心事，把紧绷的情绪慢慢舒展。不必奔赴什么目的地，只是随心漫步。吹吹晚风，捕捉细碎的美好，好好放空自己，积蓄力量，再从容面对往后的日常。");

  assert.equal(result.score, 16);
  assert.ok(result.segments.filter((segment) => segment.level === "generic").length >= 5);
  assert.equal(result.model, "local-preview");
});

test("keeps concrete actions and tradeoffs visible in the quick preview", () => {
  const result = quickAnalyzeText("上周三下午两点，我在会议室删掉了准备三天的第一版方案。客户连续三次跳过功能列表，只问登录能不能成功。我最后决定少做两个功能，把时间用来修复登录；我宁愿功能少一点，也要让真实流程跑通。");

  assert.ok(result.score >= 70);
  assert.ok(result.dimensions.choice >= 80);
  assert.ok(result.segments.some((segment) => segment.level === "human"));
});
