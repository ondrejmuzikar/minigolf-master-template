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

function sortedSeasonBoard(list) {
  return [...list]
    .filter((r) => nickFrom(r))
    .sort((a, b) => {
      const d = scoreFrom(a) - scoreFrom(b);
      if (d !== 0) return d;
      return nickFrom(a).localeCompare(nickFrom(b), "cs");
    });
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
        const seasonLabel = String(prev.label || "").trim() || "sezóna";

        if (prev.active === true) {
          for (const cat of ["do15", "od15"]) {
            const sKey = seasonRedisKey(cat);
            const seasonList = await readList(redis, sKey);
            const sorted = sortedSeasonBoard(seasonList);
            const catLabel = cat === "do15" ? "Do 15 let" : "Od 15 let";
            for (let i = 0; i < sorted.length; i++) {
              const row = sorted[i];
              const em = row?.email;
              if (typeof em !== "string" || !em.includes("@")) continue;
              if (row.emailOdběr === false) continue;
              const place = i + 1;
              const nick = nickFrom(row);
              const sc = scoreFrom(row);
              let mailText;
              if (place === 1) {
                mailText = `Ahoj ${nick}!\n\nGratulujeme k 1. místu v sezóně „${seasonLabel}“ (${catLabel}) s výsledkem ${sc} ran. Přijďte se k nám zastavit pro vyzvednutí odměny!`;
              } else {
                mailText = `Ahoj ${nick}!\n\nGratulujeme k dokončení sezóny „${seasonLabel}“ (${catLabel}). Skončil jsi na ${place}. místě s výsledkem ${sc} ran. Děkujeme za účast!`;
              }
              try {
                await sendMinigolfMail({
                  to: em.trim(),
                  subject:
                    place === 1
                      ? `Minigolf Ukázka — 1. místo v sezóně (${catLabel})`
                      : `Minigolf Ukázka — konec sezóny (${catLabel})`,
                  text: `${mailText}\n\n— Minigolf Ukázka`,
                });
              } catch (err) {
                console.error("sendMinigolfMail end season", cat, em, err);
              }
            }
          }
        }

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
