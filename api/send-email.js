import { sendMinigolfMail } from "./_email.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  body = body || {};
  const { to, nick, message, subject } = body;
  if (!to || !nick || !message) return res.status(400).json({ error: "Missing fields" });
  try {
    await sendMinigolfMail({
      to,
      subject: subject || "Minigolf Ukázka — upozornění",
      text: `Ahoj ${nick}!\n\n${message}\n\n— Minigolf Ukázka`,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
