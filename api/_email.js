import nodemailer from "nodemailer";

const DEFAULT_SMTP_USER = "minigolfliska@gmail.com";
/** Heslo aplikace Gmail — v produkci nastavte SMTP_PASS (bez mezer). */
const DEFAULT_SMTP_PASS = "evhcijswouajvlsy";
const DEFAULT_FROM = "Minigolf Liška <minigolfliska@gmail.com>";

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
    subject: subject || "Minigolf Liška",
    text: text || "",
  });
}
