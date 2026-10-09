import "server-only";
import nodemailer from "nodemailer";

export function sendingEnabled(): boolean {
  return process.env.SEND_ENABLED === "true";
}

/**
 * Real sending is off unless SEND_ENABLED=true. Every outgoing email carries an
 * unsubscribe line. Draft mode is the default and the safe path.
 *
 * SMTP_HOST / SMTP_PORT default to Gmail (use an app password for SMTP_PASS).
 */
export async function sendDraft(args: { subject: string; body: string; to?: string }): Promise<void> {
  if (!sendingEnabled()) {
    throw new Error("Sending is disabled. Set SEND_ENABLED=true to enable it.");
  }
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SEND_FROM;
  const unsubscribe = process.env.UNSUBSCRIBE_URL;
  if (!user || !pass || !from) throw new Error("SMTP_USER, SMTP_PASS and SEND_FROM are required.");
  if (!unsubscribe) throw new Error("UNSUBSCRIBE_URL is required before any email can be sent.");
  if (!args.to) throw new Error("No verified recipient address for this lead.");

  const port = Number(process.env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const body = args.body.includes(unsubscribe)
    ? args.body
    : `${args.body}\n\n---\nNot useful? Unsubscribe: ${unsubscribe}`;

  await transport.sendMail({
    from,
    to: args.to,
    subject: args.subject,
    text: body,
    headers: { "List-Unsubscribe": `<${unsubscribe}>` },
  });
}
