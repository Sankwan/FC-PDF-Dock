// What counts as a staff email address.
import fs from "node:fs";

// Mailboxes that belong to a unit rather than a person. They can pass the
// "name.name@" shape check (e.g. info.wd@) but shouldn't own an account.
const ROLE_PREFIXES = new Set([
  "admin", "administrator", "info", "enquiries", "enquiry", "contact", "hr", "it", "ict", "mis",
  "noreply", "no-reply", "support", "helpdesk", "registry", "records", "office", "secretary",
  "webmaster", "postmaster", "mail", "accounts", "finance", "procurement", "media", "pr",
]);

export const normaliseEmail = (raw) => String(raw ?? "").trim().toLowerCase();

/**
 * Staff addresses follow firstname.lastname@fc.gov.gh. We also accept a
 * middle name or initial (kwame.a.mensah), hyphenated names
 * (ama.owusu-ansah) and a trailing number that IT adds for duplicates
 * (john.mensah2). Returns an error message, or null when the address is valid.
 */
export const validateStaffEmail = (email, domain) => {
  if (!email) return "Enter your official email address.";
  if (email.length > 120) return "That email address is too long.";
  const at = email.lastIndexOf("@");
  if (at < 1) return "Enter a full email address, like firstname.lastname@" + domain + ".";
  const local = email.slice(0, at);
  const host = email.slice(at + 1);
  if (host !== domain) return `Use your official @${domain} address.`;
  const namePart = "[a-z]+(?:-[a-z]+)*";
  const pattern = new RegExp(`^${namePart}(?:\\.${namePart})+\\d{0,3}$`);
  if (!pattern.test(local)) return `Use the firstname.lastname@${domain} format.`;
  if (ROLE_PREFIXES.has(local.split(".")[0])) return "Use your personal staff address, not a shared office mailbox.";
  return null;
};

const titleCase = (s) => s.split("-").map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p)).join("-");

/** firstname.lastname@ -> { firstName: "Firstname", lastName: "Lastname" }. Worked out, never stored. */
export const namesFromEmail = (email) => {
  const parts = email.split("@")[0].replace(/\d+$/, "").split(".");
  return { firstName: titleCase(parts[0] || ""), lastName: titleCase(parts[parts.length - 1] || "") };
};

/**
 * Optional list of addresses allowed to sign in (one per line, or a CSV
 * whose first column is the email). Reloaded when the file changes, so IT
 * can update it without restarting the service.
 */
export const createAllowlist = (file) => {
  if (!file) return { enabled: false, has: () => true };
  let cache = new Set();
  let mtime = 0;
  const load = () => {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      console.error(`[allowlist] ${file} not found; nobody can sign in until it exists.`);
      cache = new Set();
      return;
    }
    if (stat.mtimeMs === mtime) return;
    mtime = stat.mtimeMs;
    cache = new Set(
      fs.readFileSync(file, "utf8").split(/\r?\n/)
        .map((line) => normaliseEmail(line.split(",")[0]))
        .filter((e) => e.includes("@"))
    );
    console.log(`[allowlist] loaded ${cache.size} addresses`);
  };
  return {
    enabled: true,
    has: (email) => {
      load();
      return cache.has(email);
    },
  };
};
