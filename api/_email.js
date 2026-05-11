import nodemailer from "nodemailer";

function getTransporter() {
  const user = process.env.SMTP_USER || "ondrej.muzikar21@gmail.com";
  const pass = process.env.SMTP_PASS || "pfqcmomongrctmlb";
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendMinigolfMail({ to, subject, text }) {
  const user = process.env.SMTP_USER || "ondrej.muzikar21@gmail.com";
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Minigolf Liška" <${user}>`,
    to,
    subject: subject || "Minigolf Liška",
    text: text || "",
  });
}
