import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./apiClient.js";

const SK = { PIN: "mg_pin" };
const DEFAULT_PIN = "123456";

const C = {
  primary: "#E8621A",
  secondary: "#4A4A4A",
  bg: "#F5F5F5",
  card: "#FFFFFF",
  text: "#333333",
  gold: "#F5A623",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
};

const fmt = (iso) => {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};
const sortP = (arr) => [...arr].sort((a, b) => a.score - b.score);

function rowToView(r) {
  if (!r || typeof r !== "object") return null;
  return {
    id: String(r.id ?? ""),
    nick: r["přezdívka"] ?? r.nick ?? "",
    score: Number(r["skóre"] ?? r.score) || 0,
    round: r["kolo"] != null && String(r["kolo"]).trim() !== "" ? String(r["kolo"]) : "—",
    note: r["poznámka"] ?? r.note ?? "",
    date: r["datum"] ?? r.date ?? "",
    email: typeof r.email === "string" ? r.email : "",
    emailOdběr: r.emailOdběr === true ? true : r.emailOdběr === false ? false : undefined,
  };
}

function viewToApiRow(v) {
  const row = {
    id: v.id,
    přezdívka: v.nick,
    skóre: Number(v.score),
    kolo: v.round === "—" ? "" : String(v.round ?? ""),
    poznámka: v.note ?? "",
    datum: v.date,
  };
  if (typeof v.email === "string") {
    if (v.email.includes("@")) row.email = v.email.trim();
    else row.email = "";
  }
  if (v.emailOdběr === true) row.emailOdběr = true;
  if (v.emailOdběr === false) row.emailOdběr = false;
  return row;
}

const daysUntil = (isoDate) => {
  if (!isoDate) return null;
  const diff = new Date(isoDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
};

/** Část „X den / dny / dní“ (bez „do konce“) — pro box pod přepínačem. */
function czechDaysCountPhrase(count) {
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 1) return "1 den";
  if (n === 2 || n === 3 || n === 4) return `${n} dny`;
  if (n >= 5) return `${n} dní`;
  return `${n} dní`;
}

/** Banner „Aktivní sezóna“: 1 den / 2–4 dny / 5+ dní + „do konce“. */
function getCzechDays(count) {
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 1) return "1 den do konce";
  if (n === 2 || n === 3 || n === 4) return `${n} dny do konce`;
  if (n >= 5) return `${n} dní do konce`;
  return "";
}

const sGet = async (key) => {
  try {
    const r = await window.storage.get(key);
    if (r) return JSON.parse(r.value);
  } catch { /* ignore */ }
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};
const sSet = async (key, val) => {
  const s = JSON.stringify(val);
  try {
    await window.storage.set(key, s);
  } catch { /* ignore */ }
  try {
    localStorage.setItem(key, s);
  } catch { /* ignore */ }
};

const inputCls =
  "w-full rounded-2xl border-2 border-gray-200 px-4 py-3 bg-[#FAFAFA] text-base font-semibold text-[#333] placeholder:text-gray-400 focus:outline-none focus:border-[#E8621A] transition-colors";
const cardShadow = { boxShadow: "0 2px 12px 0 rgba(0,0,0,0.06)" };

function Overlay({ children }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">{children}</div>;
}

function ConfirmDialog({ icon = "🦊", message, yesLabel, noLabel = "Zrušit", danger, onYes, onNo }) {
  return (
    <Overlay>
      <div
        className={`bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center border-4 ${
          danger ? "border-red-500" : "border-[#E8621A]"
        }`}
      >
        <div className="text-4xl mb-4">{icon}</div>
        <p className="text-[#333] font-semibold text-base mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          <button type="button" onClick={onNo} className="px-6 py-3 rounded-xl font-bold text-[#4A4A4A] bg-gray-100">
            {noLabel}
          </button>
          <button
            type="button"
            onClick={onYes}
            className={`px-6 py-3 rounded-xl font-bold text-white ${danger ? "bg-red-500" : "bg-[#E8621A]"}`}
          >
            {yesLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function PinModal({ onSuccess, onCancel, currentPin }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState(false);
  const check = () => {
    if (v === currentPin) onSuccess();
    else {
      setErr(true);
      setV("");
      setTimeout(() => setErr(false), 1400);
    }
  };
  return (
    <Overlay>
      <div className={`bg-white rounded-3xl shadow-2xl p-8 max-w-xs w-full mx-4 text-center border-4 ${err ? "border-red-500" : "border-[#E8621A]"}`}>
        <div className="text-4xl mb-3">🔐</div>
        <h2 className="font-black text-xl mb-1 text-[#333]">Admin přístup</h2>
        <p className="text-[#4A4A4A] text-sm mb-5">Zadej PIN</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={10}
          autoFocus
          className={`w-full text-center text-xl font-black tracking-widest border-2 rounded-2xl py-3 mb-4 focus:outline-none ${
            err ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-[#E8621A]"
          }`}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && check()}
        />
        {err && <p className="text-red-500 text-sm mb-3 font-semibold">Špatný PIN</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-[#4A4A4A] bg-gray-100">
            Zrušit
          </button>
          <button type="button" onClick={check} className="flex-1 py-3 rounded-xl font-bold text-white bg-[#E8621A]">
            Vstoupit
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ChangePinModal({ currentPin, onSave, onCancel }) {
  const [f, setF] = useState({ old: "", n1: "", n2: "" });
  const [err, setErr] = useState("");
  const go = () => {
    if (f.old !== currentPin) { setErr("Starý PIN nesedí."); return; }
    if (f.n1.length < 4) { setErr("Min. 4 znaky."); return; }
    if (f.n1 !== f.n2) { setErr("PINy se neshodují."); return; }
    onSave(f.n1);
  };
  return (
    <Overlay>
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-xs w-full mx-4 border-4 border-[#4A4A4A]">
        <h2 className="font-black text-xl mb-6 text-center text-[#333]">Změnit PIN</h2>
        {[["Starý PIN", "old"], ["Nový PIN", "n1"], ["Nový PIN znovu", "n2"]].map(([l, k]) => (
          <div key={k} className="mb-4">
            <label className="text-xs font-bold text-[#4A4A4A] uppercase tracking-wider">{l}</label>
            <input type="password" inputMode="numeric" className={inputCls + " mt-1"} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
          </div>
        ))}
        {err && <p className="text-red-500 text-sm mb-2 font-semibold">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-[#4A4A4A] bg-gray-100">Zrušit</button>
          <button type="button" onClick={go} className="flex-1 py-3 rounded-xl font-bold text-white bg-[#4A4A4A]">Uložit</button>
        </div>
      </div>
    </Overlay>
  );
}

function NewSeasonModal({ onSave, onCancel }) {
  const [label, setLabel] = useState("");
  const [endDate, setEndDate] = useState("");
  const go = () => {
    if (!label.trim() || !endDate) return;
    onSave({ label: label.trim(), endDate, active: true });
  };
  return (
    <Overlay>
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-xs w-full mx-4 border-4 border-[#E8621A]">
        <h2 className="font-black text-xl mb-6 text-center text-[#333]">🏁 Zahájit novou sezónu</h2>
        <div className="mb-4">
          <label className="text-xs font-bold text-[#4A4A4A] uppercase tracking-wider">Název sezóny</label>
          <input className={inputCls + " mt-1"} placeholder="např. Jaro 2026" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="mb-5">
          <label className="text-xs font-bold text-[#4A4A4A] uppercase tracking-wider">Konec sezóny</label>
          <input type="date" className={inputCls + " mt-1"} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <p className="text-xs text-[#4A4A4A] mb-5">Sezónní výsledky se zapíší do historického žebříčku. Po ukončení sezóny dostanou e-mailem zprávu hráči s e-mailem a odběrem upozornění.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-[#4A4A4A] bg-gray-100">Zrušit</button>
          <button type="button" onClick={go} className="flex-1 py-3 rounded-xl font-bold text-white bg-[#E8621A]">Zahájit</button>
        </div>
      </div>
    </Overlay>
  );
}

function EditPlayerModal({ player, onSave, onCancel }) {
  const [f, setF] = useState({
    nick: player.nick,
    score: String(player.score),
    round: player.round === "—" ? "" : player.round,
    note: player.note,
    email: player.email || "",
  });
  const go = () => {
    const s = parseInt(f.score, 10);
    if (!f.nick.trim() || Number.isNaN(s)) return;
    onSave({ ...player, nick: f.nick.trim(), score: s, round: f.round || "—", note: f.note.trim(), email: f.email.trim() });
  };
  return (
    <Overlay>
      <div className="bg-white rounded-3xl shadow-2xl p-5 max-w-xs w-full mx-4 border-4 border-[#E8621A]">
        <h2 className="font-black text-xl mb-6 text-center text-[#333]">✏️ Upravit hráče</h2>
        {[
          ["Přezdívka", "nick", "text", {}],
          ["Skóre", "score", "number", { min: 0, inputMode: "numeric" }],
          ["Kolo č.", "round", "number", { min: 1, inputMode: "numeric" }],
          ["Poznámka", "note", "text", {}],
          ["Email", "email", "email", {}],
        ].map(([l, k, t, ex]) => (
          <div key={k} className="mb-4">
            <label className="text-xs font-bold text-[#4A4A4A] uppercase tracking-wider">{l}</label>
            <input type={t} {...ex} className={`${inputCls} mt-1 focus:border-[#E8621A]`} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
          </div>
        ))}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-[#4A4A4A] bg-gray-100">Zrušit</button>
          <button type="button" onClick={go} className="flex-1 py-3 rounded-xl font-bold text-white bg-[#E8621A]">Uložit</button>
        </div>
      </div>
    </Overlay>
  );
}

// Barvy karet: první tři místa vždy zlato/stříbro/bronz (medaile); šedý motiv jen od 4. místa u „Od 15 let“.
function rankCardStyle(rank, category) {
  if (rank === 0) return { backgroundColor: C.gold };
  if (rank === 1) return { backgroundColor: C.silver };
  if (rank === 2) return { backgroundColor: C.bronze };
  return { backgroundColor: C.card };
}

function rankCardClass(rank, category) {
  if (rank === 0) return "border-2 border-amber-700 text-[#333]";
  if (rank === 1) return "border-2 border-gray-400 text-[#333]";
  if (rank === 2) return "border-2 border-amber-800 text-[#333]";
  const isOd15 = category === "od15";
  return `border-2 ${isOd15 ? "border-gray-400" : "border-gray-200"} bg-white text-[#333]`;
}

const MEDALS = ["🥇", "🥈", "🥉"];

function PlayerCard({ player, rank, isAdmin, onDelete, onEdit, category }) {
  const top = rank < 3;
  const rankCell = top ? (
    <span className="text-2xl leading-none w-10 text-center shrink-0 inline-block" role="img" aria-label={`${rank + 1}. místo`}>
      {MEDALS[rank]}
    </span>
  ) : (
    <div className="text-xl font-black w-10 text-center shrink-0 text-[#4A4A4A]">{rank + 1}.</div>
  );
  return (
    <div
      style={rankCardStyle(rank, category)}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 mb-3 transition-shadow ${rankCardClass(rank, category)} ${top ? "shadow-md" : ""}`}
    >
      {rankCell}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-base truncate text-[#333]">
          {player.nick}
          {player.email && <span className="ml-1 text-xs opacity-60">🔔</span>}
        </div>
        <div className={`text-xs truncate mt-0.5 ${top ? "text-[#333]/80" : "text-[#4A4A4A]"}`}>
          {player.note ? `📝 ${player.note} · ` : ""}kolo {player.round} · {fmt(player.date)}
        </div>
      </div>
      <div className="text-xl font-black shrink-0 text-[#333]">{player.score}</div>
      {isAdmin && (
        <div className="flex gap-1 ml-1 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(player); }}
            className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center hover:bg-white text-base border border-black/10"
            aria-label="Upravit"
          >✏️</button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(player); }}
            className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center hover:bg-white text-base border border-black/10"
            aria-label="Smazat"
          >🗑️</button>
        </div>
      )}
    </div>
  );
}

function ScoresBoard({ category, isAdmin, season, themeColor }) {
  const [seasonPlayers, setSeasonPlayers] = useState([]);
  const [historyPlayers, setHistoryPlayers] = useState([]);
  const [view, setView] = useState("sezona");
  const [form, setForm] = useState({ nick: "", score: "", round: "", note: "", email: "", wantsEmail: false });
  const [dialog, setDialog] = useState(null);
  const [delTarget, setDelTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [flash, setFlash] = useState({ msg: "", ok: true });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const mapList = (raw) => (Array.isArray(raw) ? raw : []).map(rowToView).filter(Boolean);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [s, h] = await Promise.all([api.getScores(category, "season"), api.getScores(category, "history")]);
      setSeasonPlayers(mapList(s));
      setHistoryPlayers(mapList(h));
    } catch (e) {
      setLoadError(e?.message || "Nepodařilo se načíst data.");
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, [category]);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(t);
  }, [load, season?.label, season?.active, season?.endDate]);

  useEffect(() => {
    const id = setInterval(() => { load(); }, 30000);
    return () => clearInterval(id);
  }, [load]);

  const flash$ = (msg, ok = true) => {
    setFlash({ msg, ok });
    setTimeout(() => setFlash({ msg: "", ok: true }), 3500);
  };

  const applyLists = (res) => {
    if (res.scoresSeason) setSeasonPlayers(mapList(res.scoresSeason));
    if (res.scoresHistory) setHistoryPlayers(mapList(res.scoresHistory));
  };

  const doAdd = async (nick) => {
    const score = parseInt(form.score, 10);
    const kolo = form.round ? String(form.round) : "";
    const poznámka = form.note.trim();
    const id = String(Date.now());
    const email = form.wantsEmail ? form.email.trim() : "";
    try {
      const body = { category, id, přezdívka: nick, skóre: score, kolo, poznámka };
      if (email && email.includes("@")) {
        body.email = email;
        body.emailOdběr = true;
      }
      const r = await api.postScore(body);
      applyLists(r);
      if (r.changed) flash$(`✅ ${nick} — ${score} ran!`);
      else flash$("Beze změny — aktuální skóre je stejné nebo lepší.", false);
      if (r.changed && email && email.includes("@")) {
        const catLabel = category === "do15" ? "Do 15 let" : "Od 15 let";
        try {
          await api.postSendEmail({
            to: email,
            nick,
            subject: "Minigolf Liška — potvrzení zápisu do žebříčku",
            message: `Potvrzujeme, že tvůj výkon (${score} ran) byl úspěšně zapsán do žebříčku v kategorii ${catLabel}.`,
          });
        } catch {
          /* email je nepovinný doplněk */
        }
      }
    } catch (e) {
      flash$(e?.message || "Chyba při ukládání.", false);
      return;
    }
    setForm({ nick: "", score: "", round: "", note: "", email: "", wantsEmail: false });
  };

  const handleSubmit = () => {
    const nick = form.nick.trim();
    const score = parseInt(form.score, 10);
    if (!nick || Number.isNaN(score) || score < 0) { flash$("❗ Vyplň přezdívku a skóre.", false); return; }
    if (form.wantsEmail && !form.email.includes("@")) { flash$("❗ Zadej platný email.", false); return; }
    const existing =
      seasonPlayers.find((p) => p.nick.toLowerCase() === nick.toLowerCase()) ||
      historyPlayers.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
    if (existing) {
      setDialog({
        message: `Přezdívka „${nick}" už existuje. Jsi to ty?`,
        onYes: () => { setDialog(null); doAdd(nick); },
        onNo: () => { setDialog(null); flash$("❗ Zvol jinou přezdívku.", false); setForm((f) => ({ ...f, nick: "" })); },
      });
    } else {
      doAdd(nick);
    }
  };

  const confirmDelete = async () => {
    if (!delTarget?.id) return;
    const nick = delTarget.nick;
    try {
      const res = await api.deleteScore(category, delTarget.id);
      applyLists(res);
      flash$(`🗑️ ${nick} smazán.`);
    } catch (e) {
      flash$(e?.message || "Smazání se nezdařilo.", false);
    }
    setDelTarget(null);
  };

  const handleEditSave = async (updated) => {
    if (!editTarget?.id) return;
    try {
      const res = await api.putScore(category, editTarget.id, viewToApiRow(updated));
      applyLists(res);
      setEditTarget(null);
      flash$(`✅ ${updated.nick} upraven.`);
    } catch (e) {
      flash$(e?.message || "Uložení se nezdařilo.", false);
    }
  };

  const days = season?.endDate ? daysUntil(season.endDate) : null;
  const displayList = sortP(view === "sezona" ? seasonPlayers : historyPlayers);

  return (
    <div className="w-full">
      {dialog && <ConfirmDialog {...dialog} yesLabel="Ano, jsem to já" noLabel="Ne, jiný hráč" onNo={dialog.onNo} />}
      {delTarget && (
        <ConfirmDialog
          icon="🗑️"
          message={`Smazat hráče „${delTarget.nick}"?`}
          yesLabel="Smazat"
          danger
          onYes={confirmDelete}
          onNo={() => setDelTarget(null)}
        />
      )}
      {editTarget && <EditPlayerModal player={editTarget} onSave={handleEditSave} onCancel={() => setEditTarget(null)} />}

      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 min-h-[40px]">
          <h2 className="text-lg font-black text-[#333] tracking-tight">Žebříček</h2>
          {isAdmin && <span className="text-[10px] font-black uppercase tracking-wider text-white px-2 py-1 rounded-full" style={{ backgroundColor: themeColor }}>Admin</span>}
        </div>
        <button
  type="button"
  onClick={() => { setRefreshing(true); load(); }}
  disabled={refreshing}
  style={{ borderColor: themeColor, color: themeColor }}
  className="text-xs font-bold px-3 py-2 rounded-xl border-2 transition-colors disabled:opacity-50"
>
  {refreshing ? "…" : "↻ Obnovit"}
</button>
      </div>

      {loadError && <div className="mb-5 rounded-2xl px-4 py-2.5 text-sm font-semibold bg-red-50 border border-red-200 text-red-800">{loadError}</div>}

      {flash.msg && (
        <div className={`mb-5 rounded-2xl px-4 py-2.5 text-sm font-semibold ${flash.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-amber-50 border border-amber-200 text-amber-900"}`}>
          {flash.msg}
        </div>
      )}

      <div className="bg-white rounded-3xl p-4 mb-5 border border-gray-200" style={cardShadow}>
        <div className="text-xs font-bold text-[#4A4A4A] mb-4 uppercase tracking-widest">Přidat / aktualizovat výkon</div>
        <div className="flex flex-col gap-3 mb-3">
          <input className={inputCls} placeholder="Přezdívka *" value={form.nick} onChange={(e) => setForm((f) => ({ ...f, nick: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Skóre (ran) *" type="number" min="0" inputMode="numeric" value={form.score} onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} />
            <input className={inputCls} placeholder="Kolo č." type="number" min="1" inputMode="numeric" value={form.round} onChange={(e) => setForm((f) => ({ ...f, round: e.target.value }))} />
          </div>
          <input className={inputCls} placeholder="Poznámka (volitelná)" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>
        <label className="flex items-start gap-2 cursor-pointer mb-3">
          <input type="checkbox" className="w-4 h-4 mt-1 shrink-0" style={{ accentColor: themeColor }} checked={form.wantsEmail} onChange={(e) => setForm((f) => ({ ...f, wantsEmail: e.target.checked }))} />
          <span className="text-sm text-[#333] leading-snug">Chci upozornění na email (pro informování o sezónním výherci)</span>
        </label>
        {form.wantsEmail && <input className={inputCls + " mb-4"} placeholder="tvůj@email.cz" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />}
        <button 
  type="button" 
  onClick={handleSubmit} 
  style={{ backgroundColor: themeColor }}
  className="w-full py-3 rounded-2xl font-black text-white text-base hover:opacity-95 transition-opacity shadow-md"
>
  POTVRDIT
</button>
      </div>

      {/* Přepínač Sezónní / Historický */}
      <div className="flex rounded-2xl overflow-hidden mb-4 bg-white border border-gray-200" style={cardShadow}>
        {[["sezona", "Sezónní"], ["vsechny", "Historický"]].map(([val, lbl]) => (
          <button
          key={val}
          type="button"
          onClick={() => setView(val)}
          className="flex-1 py-3 text-sm font-black transition-colors"
          style={view === val ? { background: themeColor, color: "#fff" } : { color: "#9ca3af", background: C.card }}
        >
            {lbl}
          </button>
        ))}
      </div>

      {/* Countdown jen pod Sezónní přepínačem */}
      {view === "sezona" && season?.active && days !== null && (
        <div
          className="mb-5 rounded-2xl px-4 py-3 text-center text-sm font-bold border-2"
          style={{
            background: days <= 7 ? "#fff0f0" : "#fff8f0",
            borderColor: days <= 7 ? "#fca5a5" : themeColor,
            color: days <= 7 ? "#b91c1c" : themeColor,
          }}
        >
          {Number(days) > 0
            ? `⏳ Do konce sezóny ${season.label} zbývá ${czechDaysCountPhrase(Number(days))}`
            : "🏁 Sezóna dnes končí!"}
        </div>
      )}

      {!loaded ? (
        <div className="text-center text-[#4A4A4A] py-10">Načítám...</div>
      ) : displayList.length === 0 ? (
        <div className="text-center text-[#4A4A4A] py-10 text-sm">{view === "sezona" ? "V této sezóně zatím nikdo nehrál." : "Zatím žádní hráči."}</div>
      ) : (
        displayList.map((p, i) => (
          <PlayerCard key={p.id || `${p.nick}-${i}`} player={p} rank={i} isAdmin={isAdmin} onDelete={setDelTarget} onEdit={() => setEditTarget(p)} category={category} />
        ))
      )}
    </div>
  );
}

const TABS = [
  { category: "do15", label: "Do 15 let" },
  { category: "od15", label: "Od 15 let" },
];

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [showEndSeason, setShowEndSeason] = useState(false);
  const [pin, setPin] = useState(DEFAULT_PIN);
  const [season, setSeason] = useState(null);
  const [logoClicks, setLogoClicks] = useState(0);
  const [adminFlash, setAdminFlash] = useState("");
  const [catTab, setCatTab] = useState(0);
  const [seasonActionsRevealed, setSeasonActionsRevealed] = useState(false);
  const clickTimer = useRef(null);
  const seasonHoldTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await sGet(SK.PIN);
        if (p) setPin(p);
      } catch { /* ignore */ }
      try {
        const s = await api.getSeason();
        if (s) setSeason(s);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleLogoClick = () => {
    const n = logoClicks + 1;
    setLogoClicks(n);
    clearTimeout(clickTimer.current);
    if (n >= 5) {
      setLogoClicks(0);
      if (isAdmin) setIsAdmin(false);
      else setShowPin(true);
    } else {
      clickTimer.current = setTimeout(() => setLogoClicks(0), 2000);
    }
  };

  const handleSavePin = async (np) => {
    setPin(np);
    await sSet(SK.PIN, np);
    setShowChangePin(false);
  };

  const handleNewSeason = async (s) => {
    try {
      const res = await api.postSeason({ label: s.label, endDate: s.endDate, active: true });
      setSeason(res.season || s);
      setShowNewSeason(false);
      setSeasonActionsRevealed(false);
      setAdminFlash(`✅ Sezóna „${(res.season || s).label}" zahájena!`);
      setTimeout(() => setAdminFlash(""), 5000);
    } catch (e) {
      setAdminFlash(e?.message || "Chyba při zahájení sezóny.");
      setTimeout(() => setAdminFlash(""), 8000);
    }
  };

  const handleEndSeason = async () => {
    setShowEndSeason(false);
    if (!season) return;
    try {
      const res = await api.postSeason({ active: false });
      if (res.season) setSeason(res.season);
      else setSeason({ ...season, active: false });
      setAdminFlash("✅ Sezóna ukončena.");
      setTimeout(() => setAdminFlash(""), 5000);
    } catch (e) {
      setAdminFlash(e?.message || "Chyba při ukončení sezóny.");
      setTimeout(() => setAdminFlash(""), 8000);
    }
  };

  const startSeasonRevealHold = () => {
    clearTimeout(seasonHoldTimer.current);
    seasonHoldTimer.current = setTimeout(() => setSeasonActionsRevealed(true), 1500);
  };
  const cancelSeasonRevealHold = () => { clearTimeout(seasonHoldTimer.current); };

  const days = season?.endDate ? daysUntil(season.endDate) : null;
  const tab = TABS[catTab];
  const themeColor = catTab === 1 ? "#555555" : C.primary;

  return (
    <div className="min-h-screen flex justify-center" style={{ background: C.bg }}>
      {showPin && <PinModal currentPin={pin} onSuccess={() => { setShowPin(false); setIsAdmin(true); }} onCancel={() => setShowPin(false)} />}
      {showChangePin && <ChangePinModal currentPin={pin} onSave={handleSavePin} onCancel={() => setShowChangePin(false)} />}
      {showNewSeason && <NewSeasonModal onSave={handleNewSeason} onCancel={() => setShowNewSeason(false)} />}
      {showEndSeason && (
        <ConfirmDialog
          icon="🏁"
          message={`Ukončit sezónu „${season?.label}"?`}
          yesLabel="Ukončit sezónu"
          danger
          onYes={handleEndSeason}
          onNo={() => setShowEndSeason(false)}
        />
      )}
      <div className="w-full max-w-lg px-5 py-10 pb-16 text-[#333]">

        {/* HEADER - logo + název, klikatelné pro admin */}
        <header className="text-center mb-8 select-none">
          <div
            className="flex flex-col items-center gap-3 mb-2 cursor-default"
            onClick={handleLogoClick}
          >
            <img
              src="/liska.png"
              alt="Minigolf Liška"
              className="w-24 h-24 object-contain"
              draggable={false}
            />
            <img
              src="/logo-text.png"
              alt="Minigolf Liška"
              className="h-12 w-auto object-contain mb-2"
              draggable={false}
            />
          </div>
          <p className="text-sm font-semibold text-[#4A4A4A] mt-1">Žebříček · Lužánky</p>
        </header>

        {/* Banner aktivní sezóny */}
        {season?.active && (
          <div className="mb-6 rounded-2xl px-4 py-3 text-center text-sm font-bold border-2 border-[#fdba74] bg-white text-[#333]" style={cardShadow}>
            <span style={{ color: themeColor }}>🏆</span> Aktivní sezóna: {season.label}
            {days !== null && Number(days) >= 0 && (
              <span className="block sm:inline sm:ml-2 mt-1 sm:mt-0 text-[#4A4A4A] font-semibold text-xs sm:text-sm">
                {Number(days) > 0 ? getCzechDays(Number(days)) : "dnes končí!"}
              </span>
            )}
          </div>
        )}

        {/* Přepínač Do 15 / Od 15 */}
        <div className="flex rounded-2xl overflow-hidden mb-6 bg-white border border-gray-200" style={cardShadow}>
          {TABS.map((t, i) => (
            <button
              key={t.category}
              type="button"
              onClick={() => setCatTab(i)}
              className="flex-1 py-3.5 text-sm font-black transition-colors"
              style={catTab === i ? { background: themeColor, color: "#fff" } : { color: "#9ca3af", background: C.card }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Admin panel */}
        {isAdmin && (
          <div className="mb-6 rounded-2xl p-5 bg-white border-2 border-gray-200" style={cardShadow}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-black text-sm text-[#4A4A4A]">🔑 Admin režim</span>
              <button type="button" onClick={() => setIsAdmin(false)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-[#333] hover:bg-gray-200 border border-gray-200">
                Odhlásit
              </button>
            </div>
            {adminFlash && (
              <div className="mb-3 rounded-xl px-3 py-2 text-sm font-semibold bg-green-50 text-green-800 border border-green-200">{adminFlash}</div>
            )}
            {season && !season.active && (
              <div className="mb-3 rounded-xl px-3 py-2 text-xs font-semibold bg-gray-50 text-[#4A4A4A] border border-gray-200">Žádná aktivní sezóna — zahaj novou se sekcí „Správa sezóny" níže.</div>
            )}
            <button type="button" onClick={() => setShowChangePin(true)} className="text-xs font-bold px-3 py-2 rounded-xl bg-[#4A4A4A] text-white hover:opacity-95 mb-4 w-full sm:w-auto">
              Změnit PIN
            </button>
            <div
              role="button"
              tabIndex={0}
              className="mt-2 rounded-xl border-2 border-dashed border-[#E8621A]/50 bg-[#FFF5ED] px-3 py-3 text-center select-none cursor-pointer text-xs font-bold text-[#E8621A] active:bg-[#ffe4d4]"
              onPointerDown={startSeasonRevealHold}
              onPointerUp={cancelSeasonRevealHold}
              onPointerLeave={cancelSeasonRevealHold}
              onPointerCancel={cancelSeasonRevealHold}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startSeasonRevealHold(); } }}
              onKeyUp={cancelSeasonRevealHold}
            >
              Správa sezóny — <span className="underline">podrž cca 1,5 s</span> pro zobrazení akcí
            </div>
            {seasonActionsRevealed && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setShowNewSeason(true)} className="text-xs font-bold px-3 py-2 rounded-xl bg-[#E8621A] text-white hover:opacity-95">
                  Zahájit novou sezónu
                </button>
                {season?.active && (
                  <button type="button" onClick={() => setShowEndSeason(true)} className="text-xs font-bold px-3 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600">
                    Ukončit sezónu
                  </button>
                )}
                <button type="button" onClick={() => setSeasonActionsRevealed(false)} className="text-xs font-bold px-3 py-2 rounded-xl border border-gray-300 text-[#4A4A4A]">
                  Skrýt
                </button>
              </div>
            )}
          </div>
        )}

        <ScoresBoard key={tab.category} category={tab.category} isAdmin={isAdmin} season={season} themeColor={themeColor} />
      </div>
    </div>
  );
}