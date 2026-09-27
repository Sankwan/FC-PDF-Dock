// All settings come from environment variables (see ../.env.example).
const bool = (v, fallback) => (v === undefined || v === "" ? fallback : /^(1|true|yes)$/i.test(v));
const int = (v, fallback) => (v === undefined || v === "" ? fallback : Number.parseInt(v, 10));

export const config = {
  port: int(process.env.PORT, 8100),
  host: process.env.HOST || "0.0.0.0",

  // Public origin staff open in the browser, e.g. https://pdfdock.fc.gov.gh.
  // Used for the link in the sign-in email and to check the Origin header.
  publicUrl: (process.env.PUBLIC_URL || "http://localhost:5173").replace(/\/$/, ""),

  // Only addresses on this domain can have an account.
  emailDomain: (process.env.STAFF_EMAIL_DOMAIN || "fc.gov.gh").toLowerCase(),

  // Optional: a file listing the addresses allowed to sign in (one per
  // line, or a CSV whose first column is the email). Leave unset to allow
  // any correctly formatted @fc.gov.gh address.
  allowlistFile: process.env.STAFF_ALLOWLIST_FILE || "",

  dbFile: process.env.DB_FILE || "./data/auth.sqlite",

  // Secret used to hash sign-in codes and session tokens. Required in
  // production; generate with `openssl rand -hex 32`.
  secret: process.env.AUTH_SECRET || "",

  codeTtlMinutes: int(process.env.CODE_TTL_MINUTES, 10),
  codeMaxAttempts: int(process.env.CODE_MAX_ATTEMPTS, 5),
  codeResendSeconds: int(process.env.CODE_RESEND_SECONDS, 60),
  codesPerEmailPerHour: int(process.env.CODES_PER_EMAIL_PER_HOUR, 5),
  requestsPerIpPerHour: int(process.env.REQUESTS_PER_IP_PER_HOUR, 60),
  sessionDays: int(process.env.SESSION_DAYS, 30),

  // false only for local http:// development; production is always HTTPS.
  cookieSecure: bool(process.env.COOKIE_SECURE, true),
  cookieName: "pdfdock_session",

  // Trust X-Forwarded-For from the nginx in front of this service (used
  // only, in memory, for rate limiting; never stored).
  trustProxy: bool(process.env.TRUST_PROXY, true),

  // Local demo login: this address always gets this 6-digit code, so it can
  // sign in without a mailbox. Ignored unless mail is printed to the console
  // (or kept in memory for tests) and NODE_ENV isn't production, so it can
  // never open a real deployment.
  demo:
    process.env.DEMO_EMAIL &&
    /^\d{6}$/.test(process.env.DEMO_CODE || "") &&
    ["console", "memory"].includes(process.env.MAIL_MODE || "smtp") &&
    process.env.NODE_ENV !== "production"
      ? { email: process.env.DEMO_EMAIL.trim().toLowerCase(), code: process.env.DEMO_CODE }
      : null,

  mail: {
    // "smtp" sends real email; "console" prints the code to the log (local
    // development only); "memory" keeps messages for the test suite.
    mode: process.env.MAIL_MODE || "smtp",
    from: process.env.MAIL_FROM || "PDFDock <no-reply@fc.gov.gh>",
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: int(process.env.SMTP_PORT, 587),
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  },
};

export const assertProductionConfig = () => {
  const problems = [];
  if (!config.secret || config.secret.length < 32) problems.push("AUTH_SECRET must be set (at least 32 characters).");
  if (config.mail.mode === "smtp" && !config.mail.smtp.host) problems.push("SMTP_HOST must be set when MAIL_MODE=smtp.");
  if (problems.length) {
    for (const p of problems) console.error(`[config] ${p}`);
    process.exit(1);
  }
};
