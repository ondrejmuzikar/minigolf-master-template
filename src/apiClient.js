const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

async function parseJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function getScores() {
  const res = await fetch(apiUrl("/api/scores"));
  if (!res.ok) throw new Error(`GET /api/scores failed: ${res.status}`);
  const data = await parseJson(res);
  return Array.isArray(data) ? data : [];
}

export async function postScore(body) {
  const res = await fetch(apiUrl("/api/scores"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /api/scores failed: ${res.status}`);
  return parseJson(res);
}

export async function deleteScore(id) {
  const q = new URLSearchParams({ id: String(id) });
  const res = await fetch(apiUrl(`/api/scores?${q}`), { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/scores failed: ${res.status}`);
  return parseJson(res);
}

export async function putScore(id, body) {
  const q = new URLSearchParams({ id: String(id) });
  const res = await fetch(apiUrl(`/api/scores?${q}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT /api/scores failed: ${res.status}`);
  return parseJson(res);
}

export async function getSeason() {
  const res = await fetch(apiUrl("/api/season"));
  if (!res.ok) throw new Error(`GET /api/season failed: ${res.status}`);
  return parseJson(res);
}

export async function postSeason(body) {
  const res = await fetch(apiUrl("/api/season"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /api/season failed: ${res.status}`);
  return parseJson(res);
}
