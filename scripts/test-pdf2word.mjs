// Run against a loopback-only, disposable pilot deployment with a fake API key.
// Example: PDF2WORD_TEST_URL=http://127.0.0.1:4174 npm run test:pdf2word
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const base = process.env.PDF2WORD_TEST_URL;
const fixtures = process.env.PDF2WORD_TEST_FIXTURES;
if (!base || !fixtures || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) {
  throw new Error('Set a loopback PDF2WORD_TEST_URL and PDF2WORD_TEST_FIXTURES directory; never run synthetic uploads against production.');
}
const health = await fetch(`${base}/api/pdf2word/health`);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: 'ok' });
for (const name of ['native', 'scanned']) {
  const form = new FormData();
  form.append('file', new Blob([await readFile(`${fixtures}/${name}.pdf`)], { type: 'application/pdf' }), `${name}.pdf`);
  const response = await fetch(`${base}/api/pdf2word/convert/pdf-to-word`, { method: 'POST', body: form, signal: AbortSignal.timeout(300_000) });
  assert.equal(response.status, 200, `${name}: ${response.status}`);
  assert.match(response.headers.get('content-type'), /wordprocessingml.document/);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /PILOT FIELD REPORT/i);
  assert.match(xml, /sample documents/i);
  console.log(`PASS: ${name} PDF produces DOCX with real editable report text through Nginx.`);
}
const invalid = new FormData();
invalid.append('file', new Blob(['not a PDF']), 'invalid.pdf');
assert.equal((await fetch(`${base}/api/pdf2word/convert/pdf-to-word`, { method: 'POST', body: invalid })).status, 400);
const tooManyPages = new FormData();
tooManyPages.append('file', new Blob([await readFile(`${fixtures}/over-limit.pdf`)]), 'over-limit.pdf');
assert.equal((await fetch(`${base}/api/pdf2word/convert/pdf-to-word`, { method: 'POST', body: tooManyPages })).status, 422);
console.log('PASS: invalid files and documents above the configured page limit are rejected.');
