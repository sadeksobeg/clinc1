import "server-only";
import nodemailer from "nodemailer";
import { brand } from "@/lib/brand";

export type ContactPayload = {
  name: string;
  email: string;
  message: string;
};

function contactToAddress(): string {
  return (process.env.CONTACT_TO_EMAIL || brand.email).trim();
}

function smtpFromAddress(): string {
  const from = process.env.SMTP_FROM?.trim();
  if (from) return from;
  return `"${brand.nameAr}" <${contactToAddress()}>`;
}

async function sendViaSmtp(payload: ContactPayload): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return false;

  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE !== "false" && port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const to = contactToAddress();
  const subject = `[${brand.nameAr}] رسالة تواصل من ${payload.name}`;
  const text = [
    `اسم المرسل: ${payload.name}`,
    `البريد: ${payload.email}`,
    "",
    "الرسالة:",
    payload.message,
    "",
    `— نموذج تواصل ${brand.siteUrl}`,
  ].join("\n");

  await transporter.sendMail({
    from: smtpFromAddress(),
    to,
    replyTo: payload.email,
    subject,
    text,
  });

  return true;
}

async function sendViaWebhook(payload: ContactPayload): Promise<boolean> {
  const webhook = process.env.CONTACT_EMAIL_WEBHOOK_URL?.trim();
  if (!webhook) return false;

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "contact_form",
      to: contactToAddress(),
      ...payload,
      created_at: new Date().toISOString(),
    }),
  });

  return res.ok;
}

/** Sends contact form to info@tenegta.com via SMTP or optional webhook. */
export async function deliverContactMessage(payload: ContactPayload): Promise<"sent" | "not_configured"> {
  if (await sendViaSmtp(payload)) return "sent";
  if (await sendViaWebhook(payload)) return "sent";
  return "not_configured";
}
