import assert from "node:assert/strict";
import test from "node:test";

import { calibrateDimensions, normalizeEvidence, splitSentences } from "../zhipu-api/lib/human-made.js";

const genericDiary = `8月16日 周六 晴

难得卸下忙碌出门走走。风暖暖的，街边草木郁郁葱葱，慢慢闲逛，看往来行人，感受城市松弛的烟火气息。暂时抛开生活里的焦虑与心事，把紧绷的情绪慢慢舒展。不必奔赴什么目的地，只是随心漫步。吹吹晚风，捕捉细碎的美好，好好放空自己，积蓄力量，再从容面对往后的日常。`;

test("caps a polished but interchangeable diary", () => {
  const calibration = calibrateDimensions(
    genericDiary,
    {
      personal_anchor: 70,
      specific_detail: 70,
      judgment: 80,
      choice: 75,
      voice: 85,
    },
    {
      concrete_anchors: ["8月16日 周六 晴", "风暖暖的"],
      personal_judgments: ["再从容面对往后的日常"],
      real_choices: ["只是随心漫步"],
      generic_phrases: ["卸下忙碌", "烟火气息", "放空自己", "积蓄力量"],
    },
  );

  assert.deepEqual(calibration.dimensions, {
    personal_anchor: 30,
    specific_detail: 30,
    judgment: 35,
    choice: 30,
    voice: 30,
  });
  assert.equal(calibration.evidence.concreteAnchors.length, 0);
  assert.equal(calibration.evidence.personalJudgments.length, 0);
  assert.equal(calibration.evidence.realChoices.length, 0);
  assert.ok(calibration.evidence.genericCount >= 4);
});

test("preserves dimensions when the text contains exact personal evidence", () => {
  const text = "上周三下午两点，我在会议室删掉了准备三天的第一版方案。客户连续三次跳过功能列表，只问登录能不能成功。我最后决定少做两个功能，把时间用来修复登录；我宁愿功能少一点，也要让真实流程跑通。";
  const dimensions = {
    personal_anchor: 88,
    specific_detail: 84,
    judgment: 90,
    choice: 94,
    voice: 80,
  };
  const calibration = calibrateDimensions(text, dimensions, {
    concrete_anchors: ["上周三下午两点，我在会议室删掉了准备三天的第一版方案", "客户连续三次跳过功能列表，只问登录能不能成功"],
    personal_judgments: ["我宁愿功能少一点，也要让真实流程跑通"],
    real_choices: ["我最后决定少做两个功能，把时间用来修复登录"],
    generic_phrases: [],
  });

  assert.deepEqual(calibration.dimensions, dimensions);
  assert.equal(calibration.evidence.genericCount, 0);
});

test("does not treat date and weather as concrete evidence", () => {
  const evidence = normalizeEvidence("8月16日 周六 晴", {
    concrete_anchors: ["8月16日 周六 晴"],
  });
  assert.deepEqual(evidence.concreteAnchors, []);
});

test("ignores blank lines when creating highlighted segments", () => {
  assert.deepEqual(splitSentences("8月16日 周六 晴\n \n正文。"), ["8月16日 周六 晴", "正文。"]);
});
