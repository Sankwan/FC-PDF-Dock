// Staff sign-in API for PDFDock.
//
// One flow for everyone, no passwords, nothing to fill in but an email:
//   1. POST /api/auth/request-code  {email}
//      Emails a 6-digit code to the staff member's official mailbox.
//   2. POST /api/auth/verify        {email, code}
//      Confirms the code, creates the account the first time, and sets an
//      HttpOnly session cookie.
//   3. GET  /api/auth/me            who is signed in (the app calls this on load)
//      GET  /api/auth/check         204/401 only, for nginx auth_request
//      POST /api/auth/logout
//
// Why a code rather than a click-through link: corporate mail scanners (for
// example Microsoft Defender Safe Links) open every link in an email before
// the person does, which would use up a one-time link. The email does contain
// a link for convenience, but it only pre-fills the code (in the URL
// fragment, which never reaches the server or its logs); the person still
// presses "Confirm" in the app.
import crypto from "node:crypto";
import { normaliseEmail, validateStaffEmail, namesFromEmail, createAllowlist } from "./staff.js";
import { buildCodeEmail } from "./mailer.js";

const MAX_BODY_BYTES = 8 * 1024;

export const createApp = ({ config, store, mailer, now = () => Date.now() }) => {
  const { q } = store;
  const allowlist = createAllowlist(config.allowlistFile);
  const ipHits = new Map(); // ip -> [timestamps], in memory only, for rate limiting
  const secret = config.secret || "dev-only-secret-do-not-use-in-production";

  const keyedHash = (value) => crypto.createHmac("sha256", secret).update(value).digest("hex");
  const allowedOrigin = new URL(config.publicUrl).origin;

  // ---------- helpers ----------
  const send = (res, status, body, headers = {}) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(payload);
  };

  const fail = (res, status, code, message, extra = {}) => send(res, status, { error: code, message, ...extra });

  const readJson = (req) =>
    new Promise((resolve, reject) => {
      if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) {
        reject(Object.assign(new Error("Expected JSON"), { status: 415 }));
        return;
      }
      let size = 0;
      const chunks = [];
      req.on("data", (c) => {
        size += c.length;
        if (size > MAX_BODY_BYTES) {
          reject(Object.assign(new Error("Body too large"), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
        } catch {
          reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
        }
      });
      req.on("error", reject);
    });

  const clientIp = (req) => {
    if (config.trustProxy) {
      const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
      if (fwd) return fwd;
    }
    return req.socket.remoteAddress || "unknown";
  };

  const ipLimited = (ip) => {
    const t = now();
    const hits = (ipHits.get(ip) || []).filter((h) => h > t - 3600_000);
    hits.push(t);
    ipHits.set(ip, hits);
    if (ipHits.size > 5000) for (const [k, v] of ipHits) if (v[v.length - 1] < t - 3600_000) ipHits.delete(k);
    return hits.length > config.requestsPerIpPerHour;
  };

  // Browsers always send Origin on POST; combined with SameSite=Strict
  // cookies and the JSON-only body rule this blocks cross-site requests.
  const originOk = (req) => {
    const origin = req.headers.origin;
    return !origin || origin === allowedOrigin;
  };

  const parseCookies = (req) =>
    Object.fromEntries(
      String(req.headers.cookie || "")
        .split(";")
        .map((p) => p.trim().split("="))
        .filter(([k, v]) => k && v)
        .map(([k, v]) => [k, decodeURIComponent(v)])
    );

  const sessionCookie = (token, maxAgeSeconds) =>
    [
      `${config.cookieName}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${maxAgeSeconds}`,
      config.cookieSecure ? "Secure" : "",
    ].filter(Boolean).join("; ");

  // Names are worked out from the address for greetings; nothing else is kept.
  const publicUser = (email) => ({ email, ...namesFromEmail(email) });

  const currentSession = (req) => {
    const token = parseCookies(req)[config.cookieName];
    if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
    const hash = keyedHash(token);
    const row = q.getSession.get(hash);
    if (!row) return null;
    if (row.expires_at < now() || row.status !== "active") {
      q.deleteSession.run(hash);
      return null;
    }
    return { hash, email: row.email };
  };

  const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

  // ---------- handlers ----------
  const requestCode = async (req, res) => {
    const body = await readJson(req);
    const email = normaliseEmail(body.email);
    const emailError = validateStaffEmail(email, config.emailDomain);
    if (emailError) return fail(res, 400, "invalid_email", emailError, { field: "email" });

    const existing = q.getUser.get(email);
    if (existing && existing.status !== "active") {
      return fail(res, 403, "account_disabled", "This address has been blocked from PDFDock. Contact the MIS/IT unit.");
    }
    if (!existing && !allowlist.has(email)) {
      return fail(res, 403, "not_on_staff_list", "This address isn't on the PDFDock staff list yet. Contact the MIS/IT unit.", { field: "email" });
    }

    const t = now();
    const current = q.getCode.get(email);
    if (current && t - current.created_at < config.codeResendSeconds * 1000) {
      const wait = Math.ceil((config.codeResendSeconds * 1000 - (t - current.created_at)) / 1000);
      return fail(res, 429, "resend_too_soon", `Wait ${wait} seconds before asking for another code.`, { retryAfter: wait });
    }
    const { n } = q.countSends.get(email, t - 3600_000);
    if (n >= config.codesPerEmailPerHour) {
      return fail(res, 429, "too_many_codes", "Too many codes requested for this address. Try again in an hour.");
    }

    const code = config.demo && email === config.demo.email ? config.demo.code : newCode();
    q.upsertCode.run(email, keyedHash(`${email}:${code}`), t, t + config.codeTtlMinutes * 60_000);
    q.logSend.run(email, t);

    const link = `${config.publicUrl}/verify#email=${encodeURIComponent(email)}&code=${code}`;
    const message = buildCodeEmail({ firstName: namesFromEmail(email).firstName, code, link, ttlMinutes: config.codeTtlMinutes, appName: "PDFDock" });
    try {
      await mailer.send({ to: email, ...message });
    } catch (err) {
      q.deleteCode.run(email);
      console.error("[mail] failed to send a sign-in code:", err.message);
      return fail(res, 502, "mail_failed", "We couldn't send the email just now. Try again in a few minutes.");
    }
    return send(res, 200, { ok: true, email, expiresInMinutes: config.codeTtlMinutes });
  };

  const verify = async (req, res) => {
    const body = await readJson(req);
    const email = normaliseEmail(body.email);
    const code = String(body.code ?? "").replace(/\D/g, "");
    if (!email || code.length !== 6) return fail(res, 400, "invalid_code", "Enter the 6-digit code from the email.", { field: "code" });

    const row = q.getCode.get(email);
    const t = now();
    if (!row || row.expires_at < t) {
      if (row) q.deleteCode.run(email);
      return fail(res, 400, "code_expired", "This code has expired. Ask for a new one.", { field: "code" });
    }
    if (row.attempts >= config.codeMaxAttempts) {
      q.deleteCode.run(email);
      return fail(res, 429, "too_many_attempts", "Too many wrong codes. Ask for a new one.", { field: "code" });
    }
    const expected = Buffer.from(row.code_hash, "hex");
    const actual = Buffer.from(keyedHash(`${email}:${code}`), "hex");
    if (!crypto.timingSafeEqual(expected, actual)) {
      q.bumpAttempts.run(email);
      const left = config.codeMaxAttempts - row.attempts - 1;
      return fail(res, 400, "wrong_code", left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code isn't right. Ask for a new one.", { field: "code" });
    }
    q.deleteCode.run(email);

    const existing = q.getUser.get(email);
    if (existing && existing.status !== "active") {
      return fail(res, 403, "account_disabled", "This address has been blocked from PDFDock. Contact the MIS/IT unit.");
    }
    q.insertUser.run(email, t);

    const token = crypto.randomBytes(32).toString("base64url");
    q.insertSession.run(keyedHash(token), email, t + config.sessionDays * 86400_000);
    return send(res, 200, { user: publicUser(email) }, {
      "Set-Cookie": sessionCookie(token, config.sessionDays * 86400),
    });
  };

  const me = (req, res) => {
    const s = currentSession(req);
    if (!s) return fail(res, 401, "signed_out", "Sign in to continue.");
    return send(res, 200, { user: publicUser(s.email) });
  };

  const check = (req, res) => {
    res.writeHead(currentSession(req) ? 204 : 401, { "Cache-Control": "no-store" });
    res.end();
  };

  const logout = (req, res) => {
    const s = currentSession(req);
    if (s) q.deleteSession.run(s.hash);
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  };

  const routes = {
    "POST /api/auth/request-code": { handler: requestCode, limited: true },
    "POST /api/auth/verify": { handler: verify, limited: true },
    "GET /api/auth/me": { handler: me },
    "GET /api/auth/check": { handler: check },
    "POST /api/auth/logout": { handler: logout },
    "GET /api/auth/health": { handler: (req, res) => send(res, 200, { status: "ok" }) },
  };

  return async (req, res) => {
    const url = new URL(req.url, "http://internal");
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return fail(res, 404, "not_found", "Not found.");
    try {
      if (req.method !== "GET" && !originOk(req)) return fail(res, 403, "bad_origin", "Request blocked.");
      if (route.limited && ipLimited(clientIp(req))) {
        return fail(res, 429, "rate_limited", "Too many requests from this network. Try again later.");
      }
      await route.handler(req, res);
    } catch (err) {
      if (err.status) return fail(res, err.status, "bad_request", err.message);
      console.error("[auth] unexpected error", err);
      return fail(res, 500, "server_error", "Something went wrong on our side. Try again.");
    }
  };
};
