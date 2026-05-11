import { getRedis } from "./_redis.js";

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

function qVal(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}

function seasonRedisKey(category) {
  return `scores:${category}`;
}

function historyRedisKey(category) {
  return `scores:${category}:history`;
}

const VALID_CAT = new Set(["do15", "od15"]);

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

async function seasonActive(redis) {
  const s = await redis.get(SEASON_KEY);
  return !!(s && typeof s === "object" && s.active === true);
}

function mergeRow(prev, incoming, idPrefer) {
  const email =
    typeof incoming.email === "string" && incoming.email.includes("@")
      ? incoming.email.trim()
      : typeof prev?.email === "string"
        ? prev.email
        : undefined;
  const row = {
    id: String(idPrefer || incoming?.id || prev?.id || ""),
    přezdívka: incoming["přezdívka"],
    skóre: incoming["skóre"],
    kolo: incoming["kolo"] ?? "",
    poznámka: incoming["poznámka"] ?? "",
    datum: incoming.datum ?? prev?.datum,
  };
  if (email) row.email = email;
  return row;
}

function applyMerge(list, přezdívka, skóre, kolo, poznámka, datum, id, email) {
  const lower = přezdívka.toLowerCase();
  const idx = list.findIndex((r) => nickFrom(r).toLowerCase() === lower);
  let changed = false;
  let next;
  if (idx !== -1) {
    const prev = list[idx];
    const prevScore = scoreFrom(prev);
    if (skóre < prevScore) {
      next = [...list];
      next[idx] = mergeRow(
        prev,
        {
          přezdívka,
          skóre,
          kolo: kolo || prev["kolo"] || "",
          poznámka: poznámka.trim(),
          datum,
          ...(email ? { email } : {}),
        },
        prev.id || id
      );
      changed = true;
    } else {
      next = list;
    }
  } else {
    const row = {
      id,
      přezdívka,
      skóre,
      kolo,
      poznámka: poznámka.trim(),
      datum,
    };
    if (email) row.email = email;
    next = [...list, row];
    changed = true;
  }
  return { next, changed };
}

export default async function handler(req, res) {
  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (req.method === "GET") {
    const category = String(qVal(req.query?.category) || "").toLowerCase();
    const board = String(qVal(req.query?.board) || "").toLowerCase();
    if (!VALID_CAT.has(category) || !["season", "history"].includes(board)) {
      return res.status(400).json({ error: "Use category=do15|od15 and board=season|history" });
    }
    const key = board === "history" ? historyRedisKey(category) : seasonRedisKey(category);
    try {
      const scores = await readList(redis, key);
      return res.status(200).json(scores);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "POST") {
    const body = readBody(req);
    const category = String(body.category || "").toLowerCase();
    if (!VALID_CAT.has(category)) {
      return res.status(400).json({ error: "Missing or invalid category (do15|od15)" });
    }
    const přezdívka = nickFrom(body);
    const skóre = Number(body["skóre"] ?? body.score);
    if (!přezdívka || !Number.isFinite(skóre) || skóre < 0) {
      return res.status(400).json({ error: "Missing or invalid přezdívka / skóre" });
    }
    const kolo =
      body.kolo != null && String(body.kolo).trim() !== "" ? String(body.kolo) : "";
    const poznámka =
      typeof body.poznámka === "string"
        ? body.poznámka
        : typeof body.note === "string"
          ? body.note
          : "";
    const datum = typeof body.datum === "string" ? body.datum : new Date().toISOString();
    const id = String(body.id || Date.now());
    const email =
      typeof body.email === "string" && body.email.includes("@") ? body.email.trim() : "";

    try {
      const histKey = historyRedisKey(category);
      const seaKey = seasonRedisKey(category);
      const histList = await readList(redis, histKey);
      const hRes = applyMerge(histList, přezdívka, skóre, kolo, poznámka, datum, id, email);
      if (hRes.changed) await writeList(redis, histKey, hRes.next);

      let sRes = { next: await readList(redis, seaKey), changed: false };
      if (await seasonActive(redis)) {
        sRes = applyMerge(sRes.next, přezdívka, skóre, kolo, poznámka, datum, id, email);
        if (sRes.changed) await writeList(redis, seaKey, sRes.next);
      }

      const seasonList = await readList(redis, seaKey);
      const historyList = await readList(redis, histKey);
      return res.status(200).json({
        changed: hRes.changed || sRes.changed,
        scoresSeason: seasonList,
        scoresHistory: historyList,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "DELETE") {
    const category = String(qVal(req.query?.category) || "").toLowerCase();
    const id = qVal(req.query?.id);
    if (!VALID_CAT.has(category) || !id) {
      return res.status(400).json({ error: "Missing category or id" });
    }
    try {
      const seaKey = seasonRedisKey(category);
      const histKey = historyRedisKey(category);
      let sea = await readList(redis, seaKey);
      let hist = await readList(redis, histKey);
      const hit =
        sea.find((r) => String(r.id) === String(id)) || hist.find((r) => String(r.id) === String(id));
      if (!hit) return res.status(404).json({ error: "Not found" });
      const nk = nickFrom(hit).toLowerCase();
      sea = sea.filter((r) => nickFrom(r).toLowerCase() !== nk);
      hist = hist.filter((r) => nickFrom(r).toLowerCase() !== nk);
      await writeList(redis, seaKey, sea);
      await writeList(redis, histKey, hist);
      return res.status(200).json({ ok: true, scoresSeason: sea, scoresHistory: hist });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "PUT") {
    const category = String(qVal(req.query?.category) || "").toLowerCase();
    const id = qVal(req.query?.id);
    if (!VALID_CAT.has(category) || !id) {
      return res.status(400).json({ error: "Missing category or id" });
    }
    const body = readBody(req);
    const přezdívka = nickFrom(body);
    const skóre = Number(body["skóre"] ?? body.score);
    if (!přezdívka || !Number.isFinite(skóre) || skóre < 0) {
      return res.status(400).json({ error: "Missing or invalid přezdívka / skóre" });
    }
    const kolo =
      body.kolo != null && String(body.kolo).trim() !== "" ? String(body.kolo) : "";
    const poznámka =
      typeof body.poznámka === "string"
        ? body.poznámka
        : typeof body.note === "string"
          ? body.note
          : "";
    const datum = typeof body.datum === "string" ? body.datum : new Date().toISOString();
    const emailRaw = typeof body.email === "string" ? body.email.trim() : undefined;

    try {
      const seaKey = seasonRedisKey(category);
      const histKey = historyRedisKey(category);
      let sea = await readList(redis, seaKey);
      let hist = await readList(redis, histKey);
      const hit =
        sea.find((r) => String(r.id) === String(id)) || hist.find((r) => String(r.id) === String(id));
      if (!hit) return res.status(404).json({ error: "Not found" });
      const nk = nickFrom(hit).toLowerCase();

      const patch = (row) => {
        if (nickFrom(row).toLowerCase() !== nk) return row;
        const next = {
          ...row,
          přezdívka,
          skóre,
          kolo,
          poznámka: poznámka.trim(),
          datum,
        };
        if (emailRaw && emailRaw.includes("@")) next.email = emailRaw;
        else if (emailRaw === "") delete next.email;
        return next;
      };
      sea = sea.map(patch);
      hist = hist.map(patch);
      await writeList(redis, seaKey, sea);
      await writeList(redis, histKey, hist);
      return res.status(200).json({ ok: true, scoresSeason: sea, scoresHistory: hist });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
