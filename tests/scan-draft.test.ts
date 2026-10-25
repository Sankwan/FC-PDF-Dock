import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_LIFETIME, readScanDraft, writeScanDraft, type ScanDraft } from '../client/src/lib/scanDraft';
import { fitRectangle } from '../client/src/components/RectangleControls';

const draft = (name = 'Office scan'): ScanDraft => ({
  version: 1, savedAt: Date.now(), name, pageSize: 'a4', searchable: true,
  pages: [{ id: 'one', photo: new Blob(['original']), photoW: 100, photoH: 200, quad: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }], filter: 'original', rotation: 0, result: new Blob(['processed']), resultUrl: 'blob:expired', resultW: 100, resultH: 200 }], editing: null,
});
test('local draft restores original and processed blobs but never stale object URLs', async () => {
  await writeScanDraft(draft());
  const restored = await readScanDraft();
  assert.equal(restored?.name, 'Office scan');
  assert.equal(await restored?.pages[0].photo.text(), 'original');
  assert.equal(await restored?.pages[0].result?.text(), 'processed');
  assert.equal(restored?.pages[0].resultUrl, undefined);
});
test('rapid saves and clear finish in order and cannot resurrect a deleted draft', async () => {
  await Promise.all([writeScanDraft(draft('first')), writeScanDraft(draft('latest'))]);
  assert.equal((await readScanDraft())?.name, 'latest');
  await Promise.all([writeScanDraft(draft('in flight')), writeScanDraft(null)]);
  assert.equal(await readScanDraft(), null);
});
test('expired draft is removed rather than offered for recovery', async () => {
  await writeScanDraft({ ...draft(), savedAt: Date.now() - DRAFT_LIFETIME - 1 });
  assert.equal(await readScanDraft(), null);
  assert.equal(await readScanDraft(), null);
});
test('a pending camera edit can be recovered without reopening the camera', async () => {
  const value = draft();
  value.editing = { page: value.pages[0], isNew: true, fromCamera: true };
  await writeScanDraft(value);
  const restored = await readScanDraft();
  assert.equal(restored?.editing?.fromCamera, false);
  assert.equal(restored?.editing?.page.resultUrl, undefined);
  await writeScanDraft(null);
});
test('manual document areas stay inside page bounds after oversized and negative input', () => {
  const value = fitRectangle({ x: 3, y: -2, w: 1.4, h: .2 });
  assert.deepEqual(value, { x: 0, y: 0, w: 1, h: .2 });
  const tiny = fitRectangle({ x: .99, y: .99, w: -.4, h: .3 });
  assert.ok(tiny.x + tiny.w <= 1 && tiny.y + tiny.h <= 1);
  assert.ok(tiny.w > 0 && tiny.h > 0);
});

test('staff accounts cannot read or clear one another’s local draft', async () => {
  await writeScanDraft(draft('Staff A'), 'staff-a');
  await writeScanDraft(draft('Staff B'), 'staff-b');
  assert.equal((await readScanDraft('staff-a'))?.name, 'Staff A');
  assert.equal((await readScanDraft('staff-b'))?.name, 'Staff B');
  await writeScanDraft(null, 'staff-a');
  assert.equal(await readScanDraft('staff-a'), null);
  assert.equal((await readScanDraft('staff-b'))?.name, 'Staff B');
  await writeScanDraft(null, 'staff-b');
});
