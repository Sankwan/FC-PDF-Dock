import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { createMailer } from "../src/mailer.js";
import { validateStaffEmail, namesFromEmail } from "../src/staff.js";

const ORIGIN = "http://pdfdock.test";
let server;
let base;
let mailer;
let store;
let clock = Date.parse("2026-09-28T08:00:00Z");

const baseConfig = {
  publicUrl: ORIGIN,
  emailDomain: "fc.gov.gh",
  allowlistFile: "",
  secret: "x".repeat(40),
  codeTtlMinutes: 10,
  codeMaxAttempts: 5,
  codeResendSeconds: 60,
  codesPerEmailPerHour: 5,
  requestsPerIpPerHour: 1000,
  sessionDays: 30,
  cookieSecure: false,
  cookieName: "pdfdock_session",
  trustProxy: false,
};

const start = async (overrides = {}) => {
  mailer = createMailer({ mode: "memory" });
  store = openDb(":memory:");
  const app = createApp({ config: { ...baseConfig, ...overrides }, store, mailer, now: () => clock });
  const s = http.createServer(app);
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return { s, url: `http://127.0.0.1:${s.address().port}` };
};

const call = async (url, method, pathname, body, cookie) => {
  const res = await fetch(url + pathname, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.get("set-cookie") };
};

const lastCode = () => mailer.sent.at(-1).text.match(/\b(\d{6})\b/)[1];

before(async () => {
  ({ s: server, url: base } = await start());
});
after(() => server.close());

test("email rules", () => {
  const d = "fc.gov.gh";
  assert.equal(validateStaffEmail("kofi.mensah@fc.gov.gh", d), null);
  assert.equal(validateStaffEmail("ama.owusu-ansah@fc.gov.gh", d), null);
  assert.equal(validateStaffEmail("kwame.a.boateng@fc.gov.gh", d), null);
  assert.equal(validateStaffEmail("john.mensah2@fc.gov.gh", d), null);
  assert.match(validateStaffEmail("kofi@fc.gov.gh", d), /firstname\.lastname/);
  assert.match(validateStaffEmail("kofi.mensah@gmail.com", d), /official/);
  assert.match(validateStaffEmail("info.wd@fc.gov.gh", d), /personal/);
  assert.deepEqual(namesFromEmail("ama.owusu-ansah@fc.gov.gh"), { firstName: "Ama", lastName: "Owusu-Ansah" });
});

test("first sign-in creates the account; only the email is stored", async () => {
  const email = "Efua.Asante@FC.gov.gh";
  const req = await call(base, "POST", "/api/auth/request-code", { email });
  assert.equal(req.status, 200);
  assert.equal(mailer.sent.at(-1).to, "efua.asante@fc.gov.gh");
  assert.match(mailer.sent.at(-1).text, /#email=efua\.asante%40fc\.gov\.gh&code=\d{6}/);
  // Nothing is created until the code is confirmed.
  assert.equal(store.q.getUser.get("efua.asante@fc.gov.gh"), undefined);

  const bad = await call(base, "POST", "/api/auth/verify", { email, code: lastCode() === "000000" ? "111111" : "000000" });
  assert.equal(bad.body.error, "wrong_code");

  const ok = await call(base, "POST", "/api/auth/verify", { email, code: lastCode() });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.user, { email: "efua.asante@fc.gov.gh", firstName: "Efua", lastName: "Asante" });
  assert.match(ok.setCookie, /HttpOnly/);
  assert.match(ok.setCookie, /SameSite=Strict/);
  const cookie = ok.setCookie.split(";")[0];

  const row = store.q.getUser.get("efua.asante@fc.gov.gh");
  assert.deepEqual(Object.keys(row).sort(), ["created_at", "email", "status"]);

  assert.equal((await call(base, "GET", "/api/auth/me", null, cookie)).body.user.email, "efua.asante@fc.gov.gh");
  assert.equal((await fetch(base + "/api/auth/check", { headers: { Cookie: cookie } })).status, 204);

  // The code is single-use.
  assert.equal((await call(base, "POST", "/api/auth/verify", { email, code: lastCode() })).status, 400);

  await call(base, "POST", "/api/auth/logout", {}, cookie);
  assert.equal((await call(base, "GET", "/api/auth/me", null, cookie)).status, 401);
});

test("returning staff sign in the same way", async () => {
  clock += 61_000;
  const email = "efua.asante@fc.gov.gh";
  await call(base, "POST", "/api/auth/request-code", { email });
  const ok = await call(base, "POST", "/api/auth/verify", { email, code: lastCode() });
  assert.equal(ok.status, 200);
});

test("codes expire and lock after too many wrong tries", async () => {
  const email = "yaw.darko@fc.gov.gh";
  await call(base, "POST", "/api/auth/request-code", { email });
  const code = lastCode();
  const wrong = code === "123456" ? "654321" : "123456";
  for (let i = 0; i < 5; i++) await call(base, "POST", "/api/auth/verify", { email, code: wrong });
  assert.equal((await call(base, "POST", "/api/auth/verify", { email, code })).status, 429);

  clock += 61_000;
  await call(base, "POST", "/api/auth/request-code", { email });
  clock += 11 * 60_000;
  assert.equal((await call(base, "POST", "/api/auth/verify", { email, code: lastCode() })).body.error, "code_expired");
});

test("blocked addresses can't sign in", async () => {
  clock += 61_000;
  const email = "kojo.baah@fc.gov.gh";
  await call(base, "POST", "/api/auth/request-code", { email });
  const ok = await call(base, "POST", "/api/auth/verify", { email, code: lastCode() });
  const cookie = ok.setCookie.split(";")[0];
  store.q.setStatus.run("disabled", email);
  assert.equal((await call(base, "GET", "/api/auth/me", null, cookie)).status, 401);
  assert.equal((await call(base, "POST", "/api/auth/request-code", { email })).body.error, "account_disabled");
});

test("cross-site requests are refused", async () => {
  const res = await fetch(base + "/api/auth/request-code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ email: "kofi.mensah@fc.gov.gh" }),
  });
  assert.equal(res.status, 403);
  const form = await fetch(base + "/api/auth/request-code", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN },
    body: "email=kofi.mensah@fc.gov.gh",
  });
  assert.equal(form.status, 415);
});

test("optional staff list: only listed addresses can sign in", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfdock-"));
  const file = path.join(dir, "staff.txt");
  fs.writeFileSync(file, "abena.kyei@fc.gov.gh\nKojo.Baah@fc.gov.gh\n");
  const { s, url } = await start({ allowlistFile: file });
  try {
    assert.equal((await call(url, "POST", "/api/auth/request-code", { email: "esi.nyarko@fc.gov.gh" })).body.error, "not_on_staff_list");
    assert.equal((await call(url, "POST", "/api/auth/request-code", { email: "abena.kyei@fc.gov.gh" })).status, 200);
    assert.equal((await call(url, "POST", "/api/auth/request-code", { email: "kojo.baah@fc.gov.gh" })).status, 200);
  } finally {
    s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("demo login: the demo address always gets the demo code", async () => {
  const { s, url } = await start({ demo: { email: "demo.user@fc.gov.gh", code: "123456" } });
  try {
    assert.equal((await call(url, "POST", "/api/auth/request-code", { email: "demo.user@fc.gov.gh" })).status, 200);
    assert.equal(lastCode(), "123456");
    assert.equal((await call(url, "POST", "/api/auth/verify", { email: "demo.user@fc.gov.gh", code: "123456" })).status, 200);
    clock += 61_000;
    await call(url, "POST", "/api/auth/request-code", { email: "kofi.mensah@fc.gov.gh" });
    assert.notEqual(lastCode(), "123456");
  } finally {
    s.close();
  }
});

test("demo login is off with real email or in production", async () => {
  const load = async (env) => {
    const saved = { ...process.env };
    Object.assign(process.env, { DEMO_EMAIL: "demo.user@fc.gov.gh", DEMO_CODE: "123456" }, env);
    try {
      return (await import(`../src/config.js?${Math.random()}`)).config.demo;
    } finally {
      process.env = saved;
    }
  };
  assert.ok(await load({ MAIL_MODE: "console", NODE_ENV: "development" }));
  assert.equal(await load({ MAIL_MODE: "smtp", NODE_ENV: "development" }), null);
  assert.equal(await load({ MAIL_MODE: "console", NODE_ENV: "production" }), null);
  assert.equal(await load({ MAIL_MODE: "console", NODE_ENV: "development", DEMO_CODE: "12345" }), null);
});
