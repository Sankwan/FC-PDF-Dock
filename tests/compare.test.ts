import test from "node:test";
import assert from "node:assert/strict";
import { compareWords, myers, type Word } from "../client/src/lib/compare.ts";

const words = (s: string, page = 1): Word[] => s.split(" ").map((text, i) => ({ text, page, x: i * 10, y: 0, w: 8, h: 10 }));
const apply = (a: string[], b: string[]) => {
  const ops = myers(a, b)!;
  const fromA = ops.filter((o) => o.op !== "+").map((o) => a[o.a!]);
  const fromB = ops.filter((o) => o.op !== "-").map((o) => b[o.b!]);
  return { fromA, fromB, ops };
};

test("myers reproduces both sides exactly", () => {
  const cases = [["a b c d", "a x c d"], ["", "a b"], ["a b", ""], ["a b c", "a b c"], ["x y z a b", "a b x y z"], ["the cat sat on the mat", "the dog sat on a red mat today"]];
  for (const [l, r] of cases) {
    const a = l ? l.split(" ") : [], b = r ? r.split(" ") : [];
    const { fromA, fromB } = apply(a, b);
    assert.deepEqual(fromA, a); assert.deepEqual(fromB, b);
  }
});

test("myers finds a minimal edit for a single substitution", () => {
  const { ops } = apply("1 2 3 4 5".split(" "), "1 2 9 4 5".split(" "));
  assert.equal(ops.filter((o) => o.op !== "=").length, 2);
});

test("changes are grouped and number changes flagged", () => {
  const a = words("Teak: 1,200 seedlings for the north nursery. Mahogany: 800");
  const b = words("Teak: 1,500 seedlings for the north nursery. Mahogany: 800 Cedrela: 450");
  const changes = compareWords(a, b);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].kind, "changed");
  assert.deepEqual(changes[0].removed.map((w) => w.text), ["1,200"]);
  assert.deepEqual(changes[0].added.map((w) => w.text), ["1,500"]);
  assert.ok(changes[0].numbers);
  assert.equal(changes[1].kind, "added");
  assert.deepEqual(changes[1].added.map((w) => w.text), ["Cedrela:", "450"]);
});

test("curly quotes and dashes don't count as changes", () => {
  assert.equal(compareWords(words("It’s 2020–2021"), words("It's 2020-2021")).length, 0);
});

test("a negation is flagged", () => {
  const c = compareWords(words("staff shall attend"), words("staff shall not attend"));
  assert.equal(c.length, 1);
  assert.ok(c[0].numbers);
});

test("very different long texts still produce a result", () => {
  const rnd = (seed: number) => Array.from({ length: 6000 }, (_, i) => `w${(i * seed) % 997}`).join(" ");
  const c = compareWords(words(rnd(7)), words(rnd(13)));
  assert.ok(c.length > 0);
});
