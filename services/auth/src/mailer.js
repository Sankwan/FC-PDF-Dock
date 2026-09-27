// Sends the sign-in code email. Plain, image-free HTML so it renders the
// same in Outlook, Gmail and phone mail apps, and never loads remote images
// (which would tell a third party when the email was opened).

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const buildCodeEmail = ({ firstName, code, link, ttlMinutes, appName }) => {
  const action = "sign in";
  const subject = `${code} is your ${appName} code`;
  const text = [
    `Hello ${firstName},`,
    "",
    `Use this code to ${action} on ${appName}:`,
    "",
    `    ${code}`,
    "",
    `It expires in ${ttlMinutes} minutes. You can also open this link on the same device:`,
    link,
    "",
    "If you did not ask for this code, you can ignore this email. Nobody can sign in without the code.",
    "",
    "Forestry Commission · PDFDock",
  ].join("\n");

  const spaced = code.split("").join("&#8202;");
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f6f1;font-family:Segoe UI,Arial,sans-serif;color:#15231a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f1;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #dbe3d7">
        <tr><td style="background:#0e2516;padding:16px 24px;border-bottom:4px solid #44ab4c">
          <div style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:.02em">FORESTRY COMMISSION</div>
          <div style="color:#b9d8bc;font-size:13px">${escapeHtml(appName)} · staff document tools</div>
        </td></tr>
        <tr><td style="padding:28px 24px 8px">
          <p style="margin:0 0 12px;font-size:15px">Hello ${escapeHtml(firstName)},</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5">Use this code to ${action}:</p>
          <div style="font-family:Consolas,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#1f5e27;background:#e8f4e9;padding:14px 18px;text-align:center">${spaced}</div>
          <p style="margin:16px 0 0;font-size:13px;color:#56655a">It expires in ${ttlMinutes} minutes.</p>
        </td></tr>
        <tr><td style="padding:16px 24px 24px">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#2b7d35;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px">Open ${escapeHtml(appName)} with this code</a>
          <p style="margin:18px 0 0;font-size:12.5px;line-height:1.5;color:#56655a">If you did not ask for this code, ignore this email. Nobody can sign in without it. Never share the code with anyone, including IT staff.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
};

export const createMailer = (mailConfig) => {
  const sent = [];

  if (mailConfig.mode === "memory") {
    return { sent, send: async (msg) => void sent.push(msg) };
  }

  if (mailConfig.mode === "console") {
    return {
      sent,
      send: async (msg) => {
        console.log(`\n[mail:console] To: ${msg.to}\n[mail:console] ${msg.subject}\n${msg.text}\n`);
      },
    };
  }

  let transportPromise = null;
  const transport = () => {
    transportPromise ??= import("nodemailer").then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host: mailConfig.smtp.host,
        port: mailConfig.smtp.port,
        secure: mailConfig.smtp.secure,
        auth: mailConfig.smtp.user ? { user: mailConfig.smtp.user, pass: mailConfig.smtp.pass } : undefined,
        requireTLS: !mailConfig.smtp.secure,
      })
    );
    return transportPromise;
  };

  return {
    sent,
    send: async (msg) => {
      const t = await transport();
      await t.sendMail({ from: mailConfig.from, ...msg });
    },
  };
};
