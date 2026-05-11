import { getRedis } from "./_redis.js";

const SCORES_KEY = "scores";

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

async function readScores(redis) {
  const v = await redis.get(SCORES_KEY);
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function nickFrom(row) {
  const n = row["přezdívka"] ?? row.nick ?? row.nickname;
  return typeof n === "string" ? n.trim() : "";
}

function scoreFrom(row) {
  const s = row["skóre"] ?? row.score;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
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
      const scores = await readScores(redis);
      return res.status(200).json(scores);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "POST") {
    const body = readBody(req);
    const přezdívka = nickFrom(body);
    const skóre = Number(body["skóre"] ?? body.score);
    if (!přezdívka || !Number.isFinite(skóre) || skóre < 0) {
      return res.status(400).json({ error: "Missing or invalid přezdívka / skóre" });
    }
    const kolo =
      body.kolo != null && String(body.kolo).trim() !== ""
        ? String(body.kolo)
        : "";
    const poznámka = typeof body.poznámka === "string" ? body.poznámka : typeof body.note === "string" ? body.note : "";
    const datum = typeof body.datum === "string" ? body.datum : new Date().toISOString();
    const id = String(body.id || Date.now());

    try {
      const list = await readScores(redis);
      const lower = přezdívka.toLowerCase();
      const idx = list.findIndex((r) => nickFrom(r).toLowerCase() === lower);

      let changed = false;
      let next;
      if (idx !== -1) {
        const prev = list[idx];
        const prevScore = scoreFrom(prev);
        if (skóre < prevScore) {
          next = [...list];
          next[idx] = {
            id: prev.id || id,
            přezdívka,
            skóre,
            kolo: kolo || prev["kolo"] || "",
            poznámka: poznámka.trim(),
            datum,
          };
          changed = true;
        } else {
          next = list;
        }
      } else {
        next = [
          ...list,
          {
            id,
            přezdívka,
            skóre,
            kolo,
            poznámka: poznámka.trim(),
            datum,
          },
        ];
        changed = true;
      }

      if (changed) await redis.set(SCORES_KEY, next);
      return res.status(200).json({ changed, scores: next });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "DELETE") {
    const id = req.query?.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing id query parameter" });
    }
    try {
      const list = await readScores(redis);
      const next = list.filter((r) => String(r.id) !== String(id));
      if (next.length === list.length) {
        return res.status(404).json({ error: "Not found" });
      }
      await redis.set(SCORES_KEY, next);
      return res.status(200).json({ ok: true, scores: next });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "PUT") {
    const id = req.query?.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing id query parameter" });
    }
    const body = readBody(req);
    const přezdívka = nickFrom(body);
    const skóre = Number(body["skóre"] ?? body.score);
    if (!přezdívka || !Number.isFinite(skóre) || skóre < 0) {
      return res.status(400).json({ error: "Missing or invalid přezdívka / skóre" });
    }
    const kolo =
      body.kolo != null && String(body.kolo).trim() !== ""
        ? String(body.kolo)
        : "";
    const poznámka = typeof body.poznámka === "string" ? body.poznámka : typeof body.note === "string" ? body.note : "";
    const datum = typeof body.datum === "string" ? body.datum : new Date().toISOString();

    try {
      const list = await readScores(redis);
      const idx = list.findIndex((r) => String(r.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: "Not found" });
      const next = [...list];
      next[idx] = { id: String(id), přezdívka, skóre, kolo, poznámka: poznámka.trim(), datum };
      await redis.set(SCORES_KEY, next);
      return res.status(200).json({ ok: true, scores: next });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
