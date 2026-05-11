import { getRedis } from "./_redis.js";

const SCORES_KEY = "scores";
const SEASON_KEY = "season";

function readBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body && typeof req.body === "object" ? req.body : {};
}

export default async function handler(req, res) {
  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (req.method === "GET") {
    try {
      const season = await redis.get(SEASON_KEY);
      return res.status(200).json(season ?? null);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "POST") {
    const body = readBody(req);

    if (body.active === false) {
      try {
        const prev = (await redis.get(SEASON_KEY)) || {};
        const season = { ...prev, active: false };
        await redis.set(SEASON_KEY, season);
        return res.status(200).json({ ok: true, season });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    try {
      await redis.del(SCORES_KEY);
      if (body.label && body.endDate) {
        const season = {
          label: String(body.label).trim(),
          endDate: String(body.endDate),
          active: true,
        };
        await redis.set(SEASON_KEY, season);
        return res.status(200).json({ ok: true, season });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
