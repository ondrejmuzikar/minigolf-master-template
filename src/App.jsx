import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./apiClient.js";

const SK = { PIN: "mg_pin" };

const DEFAULT_PIN = "357753";

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = [
  { bg: "from-yellow-400 to-amber-500", border: "border-yellow-400", text: "text-yellow-900" },
  { bg: "from-slate-300 to-slate-400",  border: "border-slate-400",  text: "text-slate-800"  },
  { bg: "from-orange-400 to-amber-600", border: "border-orange-500", text: "text-orange-900" },
];

const fmt = (iso) => { const d = new Date(iso); return `${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`; };
const sortP = (arr) => [...arr].sort((a,b) => a.score - b.score);

/** Normalizace záznamu z API (české klíče) do tvaru pro UI */
function rowToView(r) {
  if (!r || typeof r !== "object") return null;
  return {
    id: String(r.id ?? ""),
    nick: r["přezdívka"] ?? r.nick ?? "",
    score: Number(r["skóre"] ?? r.score) || 0,
    round: r["kolo"] != null && String(r["kolo"]).trim() !== "" ? String(r["kolo"]) : "—",
    note: r["poznámka"] ?? r.note ?? "",
    date: r["datum"] ?? r.date ?? "",
  };
}

function viewToApiRow(v) {
  return {
    id: v.id,
    přezdívka: v.nick,
    skóre: Number(v.score),
    kolo: v.round === "—" ? "" : String(v.round ?? ""),
    poznámka: v.note ?? "",
    datum: v.date,
  };
}
const daysUntil = (isoDate) => {
  if (!isoDate) return null;
  const diff = new Date(isoDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
  return Math.ceil(diff / 86400000);
};

const sGet = async (key) => {
  try { const r = await window.storage.get(key); if (r) return JSON.parse(r.value); } catch { /* ignore */ }
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
};
const sSet = async (key, val) => {
  const s = JSON.stringify(val);
  try { await window.storage.set(key, s); } catch { /* ignore */ }
  try { localStorage.setItem(key, s); } catch { /* ignore */ }
};

const inputCls = "w-full rounded-2xl border-2 border-gray-100 px-4 py-3 bg-gray-50 text-base font-semibold focus:outline-none focus:border-green-400 transition-colors";
const cardShadow = { boxShadow: "0 2px 16px 0 rgba(0,0,0,0.07)" };

function Overlay({ children }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.78)" }}>{children}</div>;
}

function ConfirmDialog({ icon="⛳", message, yesLabel, noLabel="Zrušit", danger, onYes, onNo }) {
  return (
    <Overlay>
      <div className={`bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center border-4 ${danger ? "border-red-500" : "border-green-500"}`}>
        <div className="text-4xl mb-4">{icon}</div>
        <p className="text-gray-800 font-semibold text-base mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onNo} className="px-6 py-3 rounded-xl font-bold text-gray-600 bg-gray-100">{noLabel}</button>
          <button onClick={onYes} className={`px-6 py-3 rounded-xl font-bold text-white ${danger ? "bg-red-500" : "bg-green-700"}`}>{yesLabel}</button>
        </div>
      </div>
    </Overlay>
  );
}

function PinModal({ onSuccess, onCancel, currentPin }) {
  const [v, setV] = useState(""); const [err, setErr] = useState(false);
  const check = () => { if (v === currentPin) onSuccess(); else { setErr(true); setV(""); setTimeout(() => setErr(false), 1400); } };
  return (
    <Overlay>
      <div className={`bg-white rounded-3xl shadow-2xl p-8 max-w-xs w-full mx-4 text-center border-4 ${err ? "border-red-500" : "border-green-500"}`}>
        <div className="text-4xl mb-3">🔐</div>
        <h2 className="font-black text-xl mb-1">Admin přístup</h2>
        <p className="text-gray-400 text-sm mb-5">Zadej PIN</p>
        <input type="password" inputMode="numeric" maxLength={10} autoFocus
          className={`w-full text-center text-xl font-black tracking-widest border-2 rounded-2xl py-3 mb-4 focus:outline-none ${err ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-green-500"}`}
          value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === "Enter" && check()} />
        {err && <p className="text-red-500 text-sm mb-3 font-semibold">Špatný PIN</p>}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100">Zrušit</button>
          <button onClick={check} className="flex-1 py-3 rounded-xl font-bold text-white bg-green-700">Vstoupit</button>
        </div>
      </div>
    </Overlay>
  );
}

function ChangePinModal({ currentPin, onSave, onCancel }) {
  const [f, setF] = useState({ old:"", n1:"", n2:"" }); const [err, setErr] = useState("");
  const go = () => {
    if (f.old !== currentPin) { setErr("Starý PIN nesedí."); return; }
    if (f.n1.length < 4) { setErr("Min. 4 znaky."); return; }
    if (f.n1 !== f.n2) { setErr("PINy se neshodují."); return; }
    onSave(f.n1);
  };
  return (
    <Overlay>
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-xs w-full mx-4 border-4 border-blue-500">
        <h2 className="font-black text-xl mb-6 text-center">Změnit PIN</h2>
        {[["Starý PIN","old"],["Nový PIN","n1"],["Nový PIN znovu","n2"]].map(([l,k]) => (
          <div key={k} className="mb-4">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{l}</label>
            <input type="password" inputMode="numeric" className={inputCls + " mt-1"}
              value={f[k]} onChange={e => setF(p => ({...p, [k]: e.target.value}))} />
          </div>
        ))}
        {err && <p className="text-red-500 text-sm mb-2 font-semibold">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100">Zrušit</button>
          <button onClick={go} className="flex-1 py-3 rounded-xl font-bold text-white bg-blue-600">Uložit</button>
        </div>
      </div>
    </Overlay>
  );
}

function NewSeasonModal({ onSave, onCancel }) {
  const [label, setLabel] = useState(""); const [endDate, setEndDate] = useState("");
  const go = () => { if (!label.trim() || !endDate) return; onSave({ label: label.trim(), endDate, active: true }); };
  return (
    <Overlay>
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-xs w-full mx-4 border-4 border-green-500">
        <h2 className="font-black text-xl mb-6 text-center">🏁 Zahájit novou sezónu</h2>
        <div className="mb-4">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Název sezóny</label>
          <input className={inputCls + " mt-1"} placeholder="např. Červenec–Srpen" value={label} onChange={e => setLabel(e.target.value)} />
        </div>
        <div className="mb-5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Konec sezóny</label>
          <input type="date" className={inputCls + " mt-1"} value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <p className="text-xs text-gray-400 mb-5">Žebříček v databázi se vymaže — začíná se od nuly.</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100">Zrušit</button>
          <button onClick={go} className="flex-1 py-3 rounded-xl font-bold text-white bg-green-700">Zahájit</button>
        </div>
      </div>
    </Overlay>
  );
}

function EditPlayerModal({ player, onSave, onCancel }) {
  const [f, setF] = useState({ nick: player.nick, score: String(player.score), round: player.round === "—" ? "" : player.round, note: player.note });
  const go = () => { const s = parseInt(f.score, 10); if (!f.nick.trim() || Number.isNaN(s)) return; onSave({ ...player, nick: f.nick.trim(), score: s, round: f.round||"—", note: f.note.trim() }); };
  return (
    <Overlay>
      <div className="bg-white rounded-3xl shadow-2xl p-5 max-w-xs w-full mx-4 border-4 border-orange-400">
        <h2 className="font-black text-xl mb-6 text-center">✏️ Upravit hráče</h2>
        {[["Přezdívka","nick","text",{}],["Skóre","score","number",{min:0,inputMode:"numeric"}],["Kolo č.","round","number",{min:1,inputMode:"numeric"}],["Poznámka","note","text",{}]].map(([l,k,t,ex]) => (
          <div key={k} className="mb-4">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{l}</label>
            <input type={t} {...ex} className={inputCls + " mt-1 focus:border-orange-400"} value={f[k]} onChange={e => setF(p => ({...p,[k]:e.target.value}))} />
          </div>
        ))}
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100">Zrušit</button>
          <button onClick={go} className="flex-1 py-3 rounded-xl font-bold text-white bg-orange-500">Uložit</button>
        </div>
      </div>
    </Overlay>
  );
}

function PlayerCard({ player, rank, isAdmin, onDelete, onEdit }) {
  const isMedal = rank < 3;
  const mc = MEDAL_COLORS[rank] || {};
  return (
    <div style={!isMedal ? cardShadow : {}}
      className={`flex items-center gap-4 rounded-2xl px-5 py-3 border-2 mb-3 transition-all ${isMedal ? `bg-gradient-to-r ${mc.bg} ${mc.border} shadow-lg` : "bg-white border-gray-100"}`}>
      <div className={`text-2xl font-black w-9 text-center shrink-0 ${isMedal ? mc.text : "text-gray-300"}`}>{isMedal ? MEDALS[rank] : rank+1}</div>
      <div className="flex-1 min-w-0">
        <div className={`font-bold text-base truncate ${isMedal ? mc.text : "text-gray-800"}`}>
          {player.nick}
        </div>
        <div className={`text-xs truncate mt-0.5 ${isMedal ? mc.text+" opacity-70" : "text-gray-400"}`}>
          {player.note ? `📝 ${player.note} · ` : ""}kolo {player.round} · {fmt(player.date)}
        </div>
      </div>
      <div className={`text-2xl font-black shrink-0 ${isMedal ? mc.text : "text-green-600"}`}>{player.score}</div>
      {isAdmin && (
        <div className="flex gap-1 ml-1 shrink-0">
          <button onClick={e => { e.stopPropagation(); onEdit(player); }} className="w-8 h-8 rounded-xl bg-white bg-opacity-60 flex items-center justify-center hover:bg-opacity-100 transition-all text-base">✏️</button>
          <button onClick={e => { e.stopPropagation(); onDelete(player); }} className="w-8 h-8 rounded-xl bg-white bg-opacity-60 flex items-center justify-center hover:bg-opacity-100 transition-all text-base">🗑️</button>
        </div>
      )}
    </div>
  );
}

function ScoresBoard({ color, isAdmin, season }) {
  const [players, setPlayers] = useState([]);
  const [form, setForm] = useState({ nick: "", score: "", round: "", note: "" });
  const [dialog, setDialog] = useState(null);
  const [delTarget, setDelTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [flash, setFlash] = useState({ msg: "", ok: true });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const raw = await api.getScores();
      const list = Array.isArray(raw) ? raw : [];
      setPlayers(list.map(rowToView).filter(Boolean));
    } catch (e) {
      setLoadError(e?.message || "Nepodařilo se načíst data.");
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

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

  const doAdd = async (nick) => {
    const score = parseInt(form.score, 10);
    const kolo = form.round ? String(form.round) : "";
    const poznámka = form.note.trim();
    const id = String(Date.now());

    try {
      const r = await api.postScore({
        id,
        přezdívka: nick,
        skóre: score,
        kolo,
        poznámka,
      });
      const next = (r.scores || []).map(rowToView).filter(Boolean);
      setPlayers(next);
      if (r.changed) flash$(`✅ ${nick} — ${score} ran!`);
      else flash$("Beze změny — aktuální skóre je stejné nebo lepší.", false);
    } catch (e) {
      flash$(e?.message || "Chyba při ukládání.", false);
      return;
    }
    setForm({ nick: "", score: "", round: "", note: "" });
  };

  const handleSubmit = () => {
    const nick = form.nick.trim();
    const score = parseInt(form.score, 10);
    if (!nick || Number.isNaN(score) || score < 0) {
      flash$("❗ Vyplň přezdívku a skóre.", false);
      return;
    }
    const existing = players.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
    if (existing) {
      setDialog({
        message: `Přezdívka „${nick}" už existuje. Jsi to ty?`,
        onYes: () => { setDialog(null); doAdd(nick); },
        onNo: () => {
          setDialog(null);
          flash$("❗ Zvol jinou přezdívku.", false);
          setForm((f) => ({ ...f, nick: "" }));
        },
      });
    } else {
      doAdd(nick);
    }
  };

  const confirmDelete = async () => {
    if (!delTarget?.id) return;
    const nick = delTarget.nick;
    try {
      const res = await api.deleteScore(delTarget.id);
      setPlayers((res.scores || []).map(rowToView).filter(Boolean));
      flash$(`🗑️ ${nick} smazán.`);
    } catch (e) {
      flash$(e?.message || "Smazání se nezdařilo.", false);
    }
    setDelTarget(null);
  };

  const handleEditSave = async (updated) => {
    if (!editTarget?.id) return;
    try {
      const res = await api.putScore(editTarget.id, viewToApiRow(updated));
      setPlayers((res.scores || []).map(rowToView).filter(Boolean));
      setEditTarget(null);
      flash$(`✅ ${updated.nick} upraven.`);
    } catch (e) {
      flash$(e?.message || "Uložení se nezdařilo.", false);
    }
  };

  const days = season?.endDate ? daysUntil(season.endDate) : null;
  const displayList = sortP(players);

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

      <div
        className="rounded-2xl px-5 py-3 mb-5 text-center font-black text-2xl text-white flex items-center justify-center gap-3 flex-wrap"
        style={{ background: color, boxShadow: "0 4px 20px 0 rgba(0,0,0,0.15)" }}
      >
        <span>Žebříček</span>
        {isAdmin && <span className="text-xs bg-white bg-opacity-20 rounded-full px-2 py-0.5 font-bold">ADMIN</span>}
        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            load();
          }}
          disabled={refreshing}
          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white bg-opacity-25 hover:bg-opacity-40 text-white disabled:opacity-50"
        >
          {refreshing ? "…" : "↻ Obnovit"}
        </button>
      </div>

      {loadError && (
        <div className="mb-5 rounded-2xl px-4 py-2.5 text-sm font-semibold bg-red-50 border border-red-200 text-red-800">
          {loadError}
        </div>
      )}

      {flash.msg && (
        <div
          className={`mb-5 rounded-2xl px-4 py-2.5 text-sm font-semibold ${
            flash.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-orange-50 border border-orange-200 text-orange-800"
          }`}
        >
          {flash.msg}
        </div>
      )}

      {season?.active && days !== null && (
        <div
          className="mb-5 rounded-2xl px-4 py-3 text-center text-sm font-bold border"
          style={{
            background: days <= 7 ? "#fef2f2" : "#f0fdf4",
            borderColor: days <= 7 ? "#fca5a5" : "#86efac",
            color: days <= 7 ? "#dc2626" : "#15803d",
          }}
        >
          {days > 0
            ? `⏳ Do konce sezóny ${season.label} zbývá ${days} ${days === 1 ? "den" : days < 5 ? "dny" : "dní"}`
            : "🏁 Sezóna dnes končí!"}
        </div>
      )}

      <div className="bg-white rounded-3xl p-4 mb-5" style={cardShadow}>
        <div className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest">Přidat / aktualizovat výkon</div>
        <div className="flex flex-col gap-3 mb-3">
          <input
            className={inputCls}
            placeholder="Přezdívka *"
            value={form.nick}
            onChange={(e) => setForm((f) => ({ ...f, nick: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              className={inputCls}
              placeholder="Skóre (ran) *"
              type="number"
              min="0"
              inputMode="numeric"
              value={form.score}
              onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Kolo č."
              type="number"
              min="1"
              inputMode="numeric"
              value={form.round}
              onChange={(e) => setForm((f) => ({ ...f, round: e.target.value }))}
            />
          </div>
          <input
            className={inputCls}
            placeholder="Poznámka (volitelná)"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </div>
        <button
          onClick={handleSubmit}
          className="w-full py-2.5 rounded-2xl font-black text-white text-base hover:opacity-90 transition-opacity"
          style={{ background: color }}
        >
          ⛳ POTVRDIT
        </button>
      </div>

      {!loaded ? (
        <div className="text-center text-gray-400 py-10">Načítám...</div>
      ) : displayList.length === 0 ? (
        <div className="text-center text-gray-400 py-10 text-sm">Zatím žádní hráči.</div>
      ) : (
        displayList.map((p, i) => (
          <PlayerCard
            key={p.id || `${p.nick}-${i}`}
            player={p}
            rank={i}
            isAdmin={isAdmin}
            onDelete={setDelTarget}
            onEdit={() => setEditTarget(p)}
          />
        ))
      )}
    </div>
  );
}

export default function App() {
  const [isAdmin, setIsAdmin]             = useState(false);
  const [showPin, setShowPin]             = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [showEndSeason, setShowEndSeason] = useState(false);
  const [pin, setPin]                     = useState(DEFAULT_PIN);
  const [season, setSeason]               = useState(null);
  const [logoClicks, setLogoClicks]       = useState(0);
  const [adminFlash, setAdminFlash]       = useState("");
  const clickTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await sGet(SK.PIN);
        if (p) setPin(p);
      } catch { /* ignore */ }
      try {
        const s = await api.getSeason();
        if (s) setSeason(s);
      } catch {
        /* KV / API nedostupné při startu */
      }
    })();
  }, []);

  const handleLogoClick = () => {
    const n = logoClicks + 1; setLogoClicks(n);
    clearTimeout(clickTimer.current);
    if (n >= 5) { setLogoClicks(0); if (isAdmin) setIsAdmin(false); else setShowPin(true); }
    else { clickTimer.current = setTimeout(() => setLogoClicks(0), 2000); }
  };

  const handleSavePin = async (np) => { setPin(np); await sSet(SK.PIN, np); setShowChangePin(false); };

  const handleNewSeason = async (s) => {
    try {
      const res = await api.postSeason({ label: s.label, endDate: s.endDate, active: true });
      setSeason(res.season || s);
      setShowNewSeason(false);
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

  const days = season?.endDate ? daysUntil(season.endDate) : null;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0fdf4 0%,#dbeafe 100%)", display: "flex", justifyContent: "center", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      {showPin && <PinModal currentPin={pin} onSuccess={() => { setShowPin(false); setIsAdmin(true); }} onCancel={() => setShowPin(false)} />}
      {showChangePin && <ChangePinModal currentPin={pin} onSave={handleSavePin} onCancel={() => setShowChangePin(false)} />}
      {showNewSeason && <NewSeasonModal onSave={handleNewSeason} onCancel={() => setShowNewSeason(false)} />}
      {showEndSeason && (
        <ConfirmDialog icon="🏁" message={`Ukončit sezónu „${season?.label}"? Odešlou se výsledkové emaily.`}
          yesLabel="Ukončit sezónu" danger onYes={handleEndSeason} onNo={() => setShowEndSeason(false)} />
      )}
      <div style={{ width: "100%", maxWidth: "500px", padding: "40px 20px 60px 20px" }}>
        <div className="text-center mb-7 select-none" onClick={handleLogoClick} style={{ cursor: "default" }}>
          <div style={{ fontSize: "72px", lineHeight: 1, marginBottom: "12px" }}>⛳</div>
          <h1 style={{ fontSize: "48px", fontWeight: 900, color: "#111827", letterSpacing: "-1px", lineHeight: 1.1 }}>Minigolf</h1>
          <p style={{ color: "#6b7280", fontWeight: 500, marginTop: "6px", fontSize: "14px" }}>Bílovice · Žebříček</p>
        </div>

        {season?.active && (
          <div className="mb-6 rounded-2xl px-4 py-3 text-center text-sm font-bold bg-green-100 text-green-800 border border-green-200">
            🏆 Aktivní sezóna: {season.label}
            {days !== null && days >= 0 && <span className="ml-2 opacity-70">· {days > 0 ? `${days} dní do konce` : "dnes končí!"}</span>}
          </div>
        )}

        {isAdmin && (
          <div className="mb-6 rounded-2xl p-5 bg-orange-50 border-2 border-orange-200">
            <div className="flex items-center justify-between mb-4">
              <span className="font-black text-orange-700 text-sm">🔑 Admin režim</span>
              <button onClick={() => setIsAdmin(false)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200">Odhlásit</button>
            </div>
            {adminFlash && <div className="mb-3 rounded-xl px-3 py-2 text-sm font-semibold bg-green-100 text-green-800 border border-green-200">{adminFlash}</div>}
            {season && !season.active && <div className="mb-3 rounded-xl px-3 py-2 text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">Žádná aktivní sezóna · zahaj novou tlačítkem níže</div>}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowNewSeason(true)} className="text-xs font-bold px-3 py-2 rounded-xl bg-green-700 text-white hover:bg-green-800 transition-colors">🏁 Zahájit novou sezónu</button>
              {season?.active && <button onClick={() => setShowEndSeason(true)} className="text-xs font-bold px-3 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors">🔚 Ukončit sezónu</button>}
              <button onClick={() => setShowChangePin(true)} className="text-xs font-bold px-3 py-2 rounded-xl bg-orange-200 text-orange-900 hover:bg-orange-300 transition-colors">🔑 Změnit PIN</button>
            </div>
          </div>
        )}

        <ScoresBoard color="#15803d" isAdmin={isAdmin} season={season} />
      </div>
    </div>
  );
}