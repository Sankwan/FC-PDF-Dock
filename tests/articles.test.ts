import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARTICLES, readMinutes } from "../client/src/lib/articles.ts";

const toolIds = new Set(
  [...readFileSync(new URL("../client/src/components/ToolsSection.tsx", import.meta.url), "utf8").matchAll(/\{ id: "([a-z0-9-]+)", title: "[^"]+", description/g)].map((m) => m[1]),
);
const slugs = new Set(ARTICLES.map((a) => a.slug));

test("articles: slugs are unique and URL-safe", () => {
  assert.equal(slugs.size, ARTICLES.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/);
});

test("articles: every tool they mention exists", () => {
  for (const a of ARTICLES) {
    for (const id of a.tools) assert.ok(toolIds.has(id), `${a.slug}: unknown tool ${id}`);
    for (const s of a.sections) for (const st of s.steps ?? []) if (st.tool) assert.ok(toolIds.has(st.tool), `${a.slug}: unknown step tool ${st.tool}`);
  }
});

test("articles: related guides exist and aren't the article itself", () => {
  for (const a of ARTICLES) for (const r of a.related) {
    assert.ok(slugs.has(r), `${a.slug}: unknown related ${r}`);
    assert.notEqual(r, a.slug);
  }
});

test("articles: each has steps and a sensible read time", () => {
  for (const a of ARTICLES) {
    assert.ok(a.sections.some((s) => s.steps?.length), a.slug);
    const m = readMinutes(a);
    assert.ok(m >= 1 && m <= 6, `${a.slug}: ${m} min`);
  }
});
