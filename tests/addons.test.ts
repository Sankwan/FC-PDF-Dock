import test from "node:test";
import assert from "node:assert/strict";
import { qrPixels, readQr } from "../client/src/lib/addons/qr.ts";
import {
  checkDimensions,
  decodeImagePages,
} from "../client/src/lib/addons/images.ts";

test("QR pixels decode without altering Unicode text or links", () => {
  for (const text of [
    "FC-REG-2026-001",
    "https://fc.gov.gh/doc?id=123",
    "Forestry — 森林",
  ]) {
    const { pixels, size } = qrPixels(text);
    assert.equal(readQr(pixels, size, size), text);
  }
});
test("empty/oversized QR content and missing codes fail clearly", () => {
  assert.throws(() => qrPixels(" "), /Enter/);
  assert.throws(() => qrPixels("a".repeat(2001)), /2,000/);
  assert.throws(() => qrPixels("森".repeat(700)), /2,000/);
  assert.throws(
    () => readQr(new Uint8ClampedArray(40 * 40 * 4).fill(255), 40, 40),
    /No QR/,
  );
});
test("image limits reject oversized dimensions and empty selections before decoding", async () => {
  assert.throws(() => checkDimensions(100_000, 100_000), /25 megapixels/);
  assert.throws(() => checkDimensions(0, 10), /25 megapixels/);
  await assert.rejects(decodeImagePages([]), /between 1 and 100/);
});
