// Exercise the actual Nginx entrypoint/template, including late backend startup.
// Requires Docker; uses only disposable containers and an isolated network.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(resolve(tmpdir(), 'pdfdock-deployment-'));
const name = `pdfdock-test-${process.pid}-${Date.now()}`;
const image = 'nginx:1.27-alpine';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cleanup = (...args) => { try { docker(...args); } catch {} };
let origin;
async function waitFor(path, status, expected) {
  let last;
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(2000) });
      const body = await response.text();
      last = `${response.status}: ${body}`;
      if (response.status === status && (!expected || body.includes(expected))) return;
    } catch (error) { last = error.message; }
    await delay(500);
  }
  throw new Error(`${path}: expected ${status} ${expected || ''}; got ${last}`);
}

try {
  writeFileSync(resolve(temporary, 'index.html'), 'PDFDock deployment fixture');
  writeFileSync(resolve(temporary, 'backend.conf'), `server {
    listen 8081;
    location / { return 200 "$request_method $request_uri"; }
  }`);
  docker('network', 'create', name);
  docker('run', '-d', '--name', `${name}-web`, '--network', name,
    '-p', '127.0.0.1::8080',
    '-e', 'PORT=8080', '-e', 'AUTH_SERVICE_URL=http://auth:8081',
    '-e', 'NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1',
    '-v', `${root}/docker/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro`,
    '-v', `${root}/deploy/headoffice/security-headers.conf:/etc/nginx/security-headers.conf:ro`,
    '-v', `${temporary}/index.html:/usr/share/nginx/html/index.html:ro`, image);
  origin = `http://${docker('port', `${name}-web`, '8080/tcp')}`;
  await waitFor('/', 200, 'PDFDock deployment fixture');
  await waitFor('/scan', 200, 'PDFDock deployment fixture');
  await waitFor('/api/auth/health', 502);
  assert.equal(docker('inspect', '-f', '{{.State.Running}}', `${name}-web`), 'true');
  console.log('PASS: homepage and SPA routes survive missing auth; auth fails closed with 502.');

  docker('run', '-d', '--name', `${name}-auth`, '--network', name, '--network-alias', 'auth',
    '-v', `${temporary}/backend.conf:/etc/nginx/conf.d/default.conf:ro`, image);
  await waitFor('/api/auth/health?probe=1', 200, 'GET /api/auth/health?probe=1');
  const posted = await fetch(`${origin}/api/auth/request-code?probe=2`, {
    method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(posted.status, 200);
  assert.equal(await posted.text(), 'POST /api/auth/request-code?probe=2');
  console.log('PASS: auth recovers without web restart; original path, query and method preserved.');
  docker('exec', `${name}-web`, 'nginx', '-t');
} catch (error) {
  try { console.error(docker('logs', `${name}-web`)); } catch {}
  throw error;
} finally {
  cleanup('rm', '-f', `${name}-web`, `${name}-auth`);
  cleanup('network', 'rm', name);
  rmSync(temporary, { recursive: true, force: true });
}
