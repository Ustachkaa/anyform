import { config, isProd } from "../config.js";

/**
 * Transactional email. Two drivers:
 *   log     prints the message (development; the reset link shows up in the API log)
 *   resend  sends through Resend's HTTP API (RESEND_API_KEY, MAIL_FROM)
 * Messages are plain text plus a minimal HTML twin; nothing user-supplied is
 * interpolated into HTML unescaped.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  readonly name: string;
  send(msg: MailMessage): Promise<void>;
}

/** Captured messages for the log driver, newest last. Tests and local debugging read this. */
export const sentMail: MailMessage[] = [];

const logMailer: Mailer = {
  name: "log",
  async send(msg) {
    sentMail.push(msg);
    if (sentMail.length > 50) sentMail.shift();
    if (process.env.VITEST) return;
    // In production the body holds live reset links: whoever reads the log could take the account.
    const body = isProd ? " (body withheld in production)" : `\n${msg.text}\n`;
    // eslint-disable-next-line no-console
    console.info(`[mail:log] to=${msg.to} subject="${msg.subject}"${body}`);
  },
};

const resendMailer: Mailer = {
  name: "resend",
  async send(msg) {
    if (!config.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: config.MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  },
};

let override: Mailer | undefined;

export function getMailer(): Mailer {
  return override ?? (config.MAIL_DRIVER === "resend" ? resendMailer : logMailer);
}

/** Test hook. */
export function setMailer(m: Mailer | undefined): void {
  override = m;
}

if (isProd && config.MAIL_DRIVER === "log") {
  // eslint-disable-next-line no-console
  console.warn("[mail] MAIL_DRIVER=log in production: password-reset emails are not delivered (bodies are withheld from the log). Set MAIL_DRIVER=resend.");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function passwordResetMail(to: string, link: string, minutes: number): MailMessage {
  const text = [
    "Someone (hopefully you) asked to reset the password for your Anyform account.",
    "",
    `Choose a new password here (the link works once, for ${minutes} minutes):`,
    link,
    "",
    "If you didn't ask for this, ignore this email. Your password stays the same.",
  ].join("\n");
  const html = `<p>Someone (hopefully you) asked to reset the password for your Anyform account.</p>
<p><a href="${escapeHtml(link)}">Choose a new password</a>. The link works once, for ${minutes} minutes.</p>
<p>If you didn't ask for this, ignore this email. Your password stays the same.</p>`;
  return { to, subject: "Reset your Anyform password", text, html };
}
