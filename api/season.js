import { getRedis } from "./_redis.js";
import { sendMinigolfMail } from "./_email.js";

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

function seasonRedisKey(category) {
  return `scores:${category}`;
}

function historyRedisKey(category) {
  return `scores:${category}:history`;
}

async function readList(redis, key) {
  const v = await redis.get(key);
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

async function writeList(redis, key, list) {
  await redis.set(key, list);
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

function mergeHistoryWithSeason(history, seasonRows) {
  const out = [...history];
  for (const row of seasonRows) {
    const nk = nickFrom(row).toLowerCase();
    if (!nk) continue;
    const idx = out.findIndex((r) => nickFrom(r).toLowerCase() === nk);
    const sNew = scoreFrom(row);
    if (idx === -1) {
      out.push({ ...row });
    } else {
      const sOld = scoreFrom(out[idx]);
      if (sNew < sOld) {
        out[idx] = { ...row, id: out[idx].id };
      } else if (sNew === sOld && row.email && !out[idx].email) {
        out[idx] = { ...out[idx], email: row.email };
      }
    }
  }
  return out;
}

function winnerFromSeasonList(list) {
  const sorted = [...list]
    .filter((r) => nickFrom(r))
    .sort((a, b) => scoreFrom(a) - scoreFrom(b));
  return sorted[0] || null;
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

    if (body.label && body.endDate) {
      try {
        const label = String(body.label).trim();
        const endDate = String(body.endDate);

        for (const cat of ["do15", "od15"]) {
          const sKey = seasonRedisKey(cat);
          const hKey = historyRedisKey(cat);
          const seasonList = await readList(redis, sKey);
          const histList = await readList(redis, hKey);
          const merged = mergeHistoryWithSeason(histList, seasonList);
          await writeList(redis, hKey, merged);
          await writeList(redis, sKey, []);

          const w = winnerFromSeasonList(seasonList);
          if (w?.email && typeof w.email === "string" && w.email.includes("@")) {
            const catLabel = cat === "do15" ? "Do 15 let" : "Od 15 let";
            try {
              await sendMinigolfMail({
                to: w.email.trim(),
                subject: `Minigolf Liška — výhra v sezóně (${catLabel})`,
                text: `Ahoj ${nickFrom(w)}!\n\nGratulujeme k 1. místu v sezóně „${label}“ (${catLabel}) s výsledkem ${scoreFrom(w)} ran.\n\nPřijďte se k nám zastavit pro vyzvednutí odměny!\n\n— Minigolf Liška`,
              });
            } catch (err) {
              console.error("sendMinigolfMail winner", cat, err);
            }
          }
        }

        await redis.del("scores").catch(() => {});

        const season = { label, endDate, active: true };
        await redis.set(SEASON_KEY, season);
        return res.status(200).json({ ok: true, season });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    return res.status(400).json({ error: "Invalid body" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
