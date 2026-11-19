import test from "node:test";
import assert from "node:assert/strict";
import { sentencesFromRuns, type TextRun } from "../client/src/lib/reader.ts";
import { GUIDES } from "../client/src/lib/guides.ts";

const line = (str: string, y: number, x = 50): TextRun => ({ str, x, y, w: str.length * 5, h: 10, eol: true });

test("reader: sentences split on full stops, not on abbreviations or decimals", () => {
  const s = sentencesFromRuns([
    line("Dear Mr. Mensah, the allocation for 2025 is 1.5 tonnes. Please", 100),
    line("confirm by Friday. Thank you!", 112),
  ], 1);
  assert.deepEqual(s.map((x) => x.text), ["Dear Mr. Mensah, the allocation for 2025 is 1.5 tonnes.", "Please confirm by Friday.", "Thank you!"]);
  assert.deepEqual(s.map((x) => x.page), [1, 1, 1]);
});

test("reader: a heading line without a full stop is its own sentence", () => {
  const s = sentencesFromRuns([line("Seedling Allocation Notice", 80), line("This letter confirms the allocation.", 110)], 2, 5);
  assert.deepEqual(s.map((x) => x.text), ["Seedling Allocation Notice", "This letter confirms the allocation."]);
  assert.deepEqual(s.map((x) => x.id), [5, 6]);
  assert.deepEqual(s.map((x) => x.para), [true, true]);
  const one = sentencesFromRuns([line("First one. Second one.", 100)], 1);
  assert.deepEqual(one.map((x) => x.para), [true, false]);
});

test("reader: a wrapped line in a narrow column stays in its sentence", () => {
  const s = sentencesFromRuns([line("Staff should return", 100), line("the signed copy today.", 112)], 1);
  assert.deepEqual(s.map((x) => x.text), ["Staff should return the signed copy today."]);
});

test("reader: highlight boxes cover only the sentence's part of a line", () => {
  const s = sentencesFromRuns([line("One two. Three four.", 100)], 1);
  assert.equal(s.length, 2);
  const [a, b] = s.map((x) => x.boxes[0]);
  assert.equal(a.x, 50);
  assert.ok(a.w < 50 && b.x > a.x + a.w - 1, `${JSON.stringify([a, b])}`);
  assert.equal(s[1].boxes.length, 1);
});

test("reader: pages with only numbers/punctuation give nothing to read", () => {
  assert.deepEqual(sentencesFromRuns([line("— 3 —", 800)], 3), []);
  assert.equal(sentencesFromRuns([line("2025", 800)], 3).length, 1);
});

test("guides: every tool on the home page has a guide", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync("client/src/components/ToolsSection.tsx", "utf8"));
  const ids = [...src.matchAll(/\{ id: "([a-z0-9-]+)", title: "[^"]+", description/g)].map((m) => m[1]);
  assert.ok(ids.length > 20);
  const missing = ids.filter((id) => !GUIDES.some((g) => g.id === id));
  assert.deepEqual(missing, []);
});
