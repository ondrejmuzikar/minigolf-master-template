import nodemailer from "nodemailer";

const DEFAULT_SMTP_USER = "ondrej.muzikar21@gmail.com";
/** Heslo aplikace Gmail — v produkci nastavte SMTP_PASS (bez mezer). */
const DEFAULT_SMTP_PASS = "zcblbytqqxvjzcok";
const DEFAULT_FROM = "Minigolf Ukázka <ondrej.muzikar21@gmail.com>";

function smtpAuth() {
  const user = process.env.SMTP_USER || DEFAULT_SMTP_USER;
  const raw = process.env.SMTP_PASS ?? DEFAULT_SMTP_PASS;
  const pass = String(raw).replace(/\s+/g, "");
  return { user, pass };
}

function getTransporter() {
  const { user, pass } = smtpAuth();
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendMinigolfMail({ to, subject, text }) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || DEFAULT_FROM;
  await transporter.sendMail({
    from,
    to,
    subject: subject || "Minigolf Ukázka",
    text: text || "",
  });
}
