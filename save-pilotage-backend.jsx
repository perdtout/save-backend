import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIGURATION — backend Render
// ═══════════════════════════════════════════════════════════════════════════
const API_URL = "https://save-backend-cn9b.onrender.com";

// ─── DESIGN TOKENS — Charte graphique officielle Repair Mobile / Juvi-Group ──
const C = {
  navy: "#2B2B2B", navyMid: "#3A3A3A", navyL: "#4A4A4A",
  accent: "#E8612C", accentB: "#FF8A50", white: "#FFFFFF",
  bg: "#F7F5F3", gray50: "#F0EDEA", gray200: "#D6CFC8",
  gray400: "#8A847E", gray600: "#5A544E",
  ok: "#22C55E", warn: "#F59E0B", bad: "#EF4444", text: "#2B2B2B",
};

const STORES_ORDER = ["Pontarlier", "Lons-le-Saunier", "Dijon", "Besançon", "Chalon-sur-Saône"];

// ─── GOAT — Vendeurs & données de secours (remplacées au premier fetch backend) ─
const SOLO_STORES = ["Chalon-sur-Saône", "Besançon"];

const GOAT_VENDORS = {
  "Mathis":        { store: "Pontarlier",       role: "responsable" },
  "Narcisse":      { store: "Pontarlier",       role: "technicien" },
  "Jérôme":        { store: "Lons-le-Saunier",  role: "responsable" },
  "Nassim":        { store: "Lons-le-Saunier",  role: "technicien" },
  "Jules":         { store: "Dijon",            role: "responsable" },
  "Bilhal":        { store: "Dijon",            role: "technicien" },
  "Jean-Baptiste": { store: "Chalon-sur-Saône", role: "solo" },
  "Samy":          { store: "Besançon",         role: "solo" },
};

// Données de secours affichées avant le premier chargement réussi depuis le backend
const GOAT_DATA_FALLBACK = {
  weekly: {
    label: "Semaine du 09 au 13 juin 2026",
    scores: [
      { name: "Mathis",        store: "Pontarlier",       total: 80.0, isSolo: false, breakdown: { accessoires: 25, gp: 25, mobileo: 10, atm: 20 } },
      { name: "Jérôme",        store: "Lons-le-Saunier",  total: 80.0, isSolo: false, breakdown: { accessoires: 25, gp: 25, mobileo: 10, atm: 20 } },
      { name: "Jean-Baptiste", store: "Chalon-sur-Saône", total: 55.0, isSolo: true,  breakdown: { accessoires: 22.8, gp: 23.9, mobileo: 0,  atm: 0  } },
      { name: "Jules",         store: "Dijon",            total: 50.6, isSolo: false, breakdown: { accessoires: 21.9, gp: 19.2, mobileo: 5,  atm: 4.5} },
      { name: "Nassim",        store: "Lons-le-Saunier",  total: 50.1, isSolo: false, breakdown: { accessoires: 20.1, gp: 21,   mobileo: 5,  atm: 4  } },
      { name: "Narcisse",      store: "Pontarlier",       total: 46.2, isSolo: false, breakdown: { accessoires: 22.4, gp: 19,   mobileo: 0,  atm: 4.8} },
      { name: "Samy",          store: "Besançon",         total: 43.9, isSolo: true,  breakdown: { accessoires: 14.9, gp: 25,   mobileo: 0,  atm: 0  } },
      { name: "Bilhal",        store: "Dijon",            total: 35.8, isSolo: false, breakdown: { accessoires: 18,   gp: 14.2, mobileo: 0,  atm: 3.6} },
    ],
  },
  monthly: {
    label: "Mai 2026",
    scores: [
      { name: "Mathis",        store: "Pontarlier",       total: 63.0, isSolo: false, breakdown: { accessoires: 25,   gp: 25,   mobileo: 10, atm: 3  } },
      { name: "Samy",          store: "Besançon",         total: 60.5, isSolo: true,  breakdown: { accessoires: 27.3, gp: 25,   mobileo: 8.3,atm: 0  } },
      { name: "Jean-Baptiste", store: "Chalon-sur-Saône", total: 57.8, isSolo: true,  breakdown: { accessoires: 25,   gp: 20.5, mobileo: 5,  atm: 0  } },
      { name: "Jérôme",        store: "Lons-le-Saunier",  total: 56.0, isSolo: false, breakdown: { accessoires: 25,   gp: 25,   mobileo: 0,  atm: 6  } },
      { name: "Narcisse",      store: "Pontarlier",       total: 55.0, isSolo: false, breakdown: { accessoires: 25,   gp: 25,   mobileo: 5,  atm: 0  } },
      { name: "Nassim",        store: "Lons-le-Saunier",  total: 48.0, isSolo: false, breakdown: { accessoires: 23,   gp: 25,   mobileo: 0,  atm: 0  } },
      { name: "Jules",         store: "Dijon",            total: 46.4, isSolo: false, breakdown: { accessoires: 25,   gp: 13.1, mobileo: 0,  atm: 5  } },
      { name: "Bilhal",        store: "Dijon",            total: 45.4, isSolo: false, breakdown: { accessoires: 22.2, gp: 18.6, mobileo: 0,  atm: 0  } },
    ],
  },
  titlesHistory: [
    { type: "month", label: "Mai 2026",       winner: "Mathis",   score: 63.0  },
    { type: "month", label: "Avril 2026",     winner: "Jérôme",   score: 100.0 },
    { type: "month", label: "Mars 2026",      winner: "Jérôme",   score: 95.0  },
    { type: "month", label: "Février 2026",   winner: "Nassim",   score: 89.1  },
    { type: "month", label: "Janvier 2026",   winner: "Jérôme",   score: 95.0  },
    { type: "month", label: "Décembre 2025",  winner: "Jérôme",   score: 84.0  },
    { type: "month", label: "Novembre 2025",  winner: "Jérôme",   score: 82.1  },
    { type: "month", label: "Octobre 2025",   winner: "Jérôme",   score: 80.0  },
    { type: "month", label: "Septembre 2025", winner: "Jérôme",   score: 100.0 },
    { type: "week",  label: "09–13 juin 2026 (co-MVP)", winner: "Mathis", score: 80.0 },
    { type: "week",  label: "09–13 juin 2026 (co-MVP)", winner: "Jérôme", score: 80.0 },
  ],
};

function computeGoatSeasonPoints(titlesHistory) {
  const pts = {};
  (titlesHistory || []).forEach(t => {
    if (!pts[t.winner]) pts[t.winner] = { weeks: 0, months: 0, points: 0 };
    if (t.type === "week") { pts[t.winner].weeks += 1; pts[t.winner].points += 1; }
    if (t.type === "month") { pts[t.winner].months += 1; pts[t.winner].points += 3; }
  });
  return Object.entries(pts)
    .map(([name, p]) => ({ name, store: GOAT_VENDORS[name]?.store, ...p }))
    .sort((a, b) => b.points - a.points);
}

function computeCurrentStreak(titlesHistory) {
  const monthly = (titlesHistory || []).filter(t => t.type === "month");
  if (monthly.length === 0) return null;
  let bestName = monthly[0].winner, bestCount = 1, curName = monthly[0].winner, curCount = 1;
  for (let i = 1; i < monthly.length; i++) {
    if (monthly[i].winner === curName) { curCount++; } else { curName = monthly[i].winner; curCount = 1; }
    if (curCount > bestCount) { bestCount = curCount; bestName = curName; }
  }
  return { name: bestName, count: bestCount };
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
const statusC = (s) => s === "ok" ? C.ok : s === "warn" ? C.warn : s === "bad" ? C.bad : C.gray400;
const trendLabel = (t) => t > 0 ? `📈 +${t}` : t < 0 ? `📉 ${t}` : "➡️ =";
const eur = (v) => v == null ? "—" : `${v.toLocaleString("fr-FR")} €`;

// ─── API CLIENT ───────────────────────────────────────────────────────────────
const api = {
  token: null,
  async login(username, password) {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error("Identifiants incorrects");
    const data = await res.json();
    this.token = data.token;
    return data.user;
  },
  async get(path) {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Erreur ${res.status}`);
    }
    return res.json();
  },
};

// ─── UI PRIMITIVES ─────────────────────────────────────────────────────────────
function Card({ children, style = {}, accent }) {
  return (
    <div style={{
      background: C.white, borderRadius: 12, padding: "18px 20px",
      boxShadow: "0 1px 4px rgba(13,31,60,0.07)", border: `1px solid ${C.gray50}`,
      borderLeft: accent ? `4px solid ${accent}` : undefined, ...style,
    }}>{children}</div>
  );
}

function Gauge({ value, max = 100, target, color }) {
  const pct = Math.min(100, ((value || 0) / max) * 100);
  const tpct = Math.min(98, (target / max) * 100);
  return (
    <div style={{ position: "relative", height: 8, background: C.gray50, borderRadius: 4, minWidth: 80 }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.5s" }} />
      <div style={{ position: "absolute", left: `${tpct}%`, top: -3, width: 2, height: 14, background: C.navy, opacity: 0.25, borderRadius: 1 }} />
    </div>
  );
}

function SectionHead({ children }) {
  return <h3 style={{ margin: "0 0 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.gray400 }}>{children}</h3>;
}

function Btn({ children, onClick, variant = "primary", size = "md", style = {} }) {
  const s = { sm: { padding: "5px 12px", fontSize: 12 }, md: { padding: "9px 16px", fontSize: 13 }, lg: { padding: "11px 22px", fontSize: 14 } };
  const v = {
    primary: { background: C.accent, color: C.white },
    secondary: { background: C.gray50, color: C.navy },
    navy: { background: C.navy, color: C.white },
  };
  return <button onClick={onClick} style={{ cursor: "pointer", border: "none", borderRadius: 8, fontFamily: "inherit", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5, ...s[size], ...v[variant], ...style }}>{children}</button>;
}

function Spinner({ label = "Chargement…" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 40 }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${C.gray50}`, borderTop: `3px solid ${C.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 13, color: C.gray400 }}>{label}</span>
    </div>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <Card accent={C.bad}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>Connexion au serveur impossible</div>
          <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>{message}. Vérifie que le backend tourne sur {API_URL}.</div>
        </div>
        {onRetry && <Btn size="sm" variant="secondary" onClick={onRetry}>Réessayer</Btn>}
      </div>
    </Card>
  );
}

// ─── LOGO — Hexagone + Smartphone (identité Repair Mobile) ───────────────────
function RepairMobileLogo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 2 L35.3 11 V29 L20 38 L4.7 29 V11 Z" fill={C.accent} />
      <rect x="14.5" y="11" width="11" height="18" rx="2.2" stroke={C.white} strokeWidth="1.8" fill="none" />
      <circle cx="20" cy="25.3" r="1.3" fill={C.white} />
    </svg>
  );
}

// ─── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true); setErr("");
    try {
      const user = await api.login(u, p);
      onLogin(user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: "10px 18px" }}>
          <RepairMobileLogo size={38} />
          <div>
            <div style={{ color: C.white, fontSize: 17, fontWeight: 800, letterSpacing: "0.02em" }}>REPAIR<span style={{ color: C.accentB }}>MOBILE</span></div>
            <div style={{ color: C.accentB, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>SAVE · Pilotage Réseau</div>
          </div>
        </div>
      </div>
      <div style={{ background: C.white, borderRadius: 16, padding: "28px 26px", width: "100%", maxWidth: 350, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: C.navy }}>Connexion</h2>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: C.gray400 }}>Accès réservé aux équipes SAVE</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[["Identifiant", u, setU, "text", "thomas.desternes"], ["Mot de passe", p, setP, "password", "••••••"]].map(([label, val, set, type, ph]) => (
            <div key={label}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>{label}</label>
              <input type={type} value={val} onChange={e => set(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} placeholder={ph}
                style={{ width: "100%", border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          ))}
          {err && <div style={{ fontSize: 12, color: C.bad, background: "#FEE2E2", padding: "8px 12px", borderRadius: 8 }}>{err}</div>}
          <Btn onClick={go} size="lg" style={{ width: "100%", justifyContent: "center", marginTop: 4, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Connexion…" : "Se connecter"}
          </Btn>
        </div>
        <div style={{ marginTop: 16, padding: 10, background: C.bg, borderRadius: 8, fontSize: 11, color: C.gray400, lineHeight: 1.6 }}>
          <strong style={{ color: C.gray600 }}>RZ :</strong> thomas.desternes / rz2024<br />
          <strong style={{ color: C.gray600 }}>Magasins :</strong> dijon · lons · pontarlier · chalon · besancon
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ user, data }) {
  const stores = user.role === "rz" ? STORES_ORDER : [user.store];
  const d = data?.page1, d2 = data?.page2;

  const tz = {
    margeTotal: Object.values(d?.accessoires || {}).reduce((s, v) => s + (v.margeTotal || 0), 0),
    margeAcc: Object.values(d?.accessoires || {}).reduce((s, v) => s + (v.margeAcc || 0), 0),
    margeGP: Object.values(d?.gp || {}).reduce((s, v) => s + (v.margeGP || 0), 0),
    occasion: Object.values(d?.occasion || {}).reduce((s, v) => s + (v.volume || 0), 0),
    mobileo: Object.values(d2?.mobileo || {}).reduce((s, v) => s + (v.total || 0), 0),
    atm: Object.values(d2?.atm || {}).reduce((s, v) => s + (v.total || 0), 0),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.navy }}>Vue d'ensemble</h2>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: C.gray400 }}>{data?.period} · données Notion du {data?.updated}</p>
      </div>

      {user.role === "rz" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {[
            { label: "Marge totale zone", val: eur(tz.margeTotal), icon: "💰" },
            { label: "Ratio Accessoires", val: tz.margeTotal ? `${((tz.margeAcc / tz.margeTotal) * 100).toFixed(1)}%` : "—", icon: "🛒" },
            { label: "Ratio GP zone", val: tz.margeTotal ? `${((tz.margeGP / tz.margeTotal) * 100).toFixed(1)}%` : "—", icon: "🛡️" },
            { label: "Mobiles Occasion", val: `${tz.occasion} unités`, icon: "📱" },
            { label: "Forfaits Mobileo", val: `${tz.mobileo} contrats`, icon: "📶" },
            { label: "Contrats ATM", val: `${tz.atm} sur ${tz.occasion} occ.`, icon: "🔒" },
          ].map(({ label, val, icon }) => (
            <Card key={label} style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.navy }}>{val}</div>
              <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{label}</div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
        {stores.map(store => {
          const acc = d?.accessoires?.[store], gp = d?.gp?.[store], occ = d?.occasion?.[store];
          const mob = d2?.mobileo?.[store], atm = d2?.atm?.[store];
          const kpis = [
            { k: "Acc.", v: acc?.ratio, suf: "%", s: acc?.status },
            { k: "GP", v: gp?.ratio, suf: "%", s: gp?.status },
            { k: "Occ.", v: occ?.volume, suf: "", s: occ?.volume >= occ?.objectif ? "ok" : "bad" },
            { k: "Mob.", v: mob?.total, suf: "", s: mob?.total >= 10 ? "ok" : "bad" },
            { k: "ATM", v: atm?.ratio, suf: "%", s: atm?.status },
          ];
          const okC = kpis.filter(x => x.s === "ok").length;
          const tc = okC >= 4 ? C.ok : okC >= 2 ? C.warn : C.bad;
          return (
            <Card key={store} style={{ borderTop: `3px solid ${tc}` }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: C.navy, marginBottom: 6 }}>{store}</div>
              <div style={{ fontSize: 11, color: tc, fontWeight: 700, marginBottom: 10 }}>{okC}/5 objectifs atteints</div>
              {kpis.map(({ k, v, suf, s }) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: C.gray400 }}>{k}</span>
                  <span style={{ color: v == null ? C.gray200 : statusC(s), fontWeight: 700 }}>{v == null ? "—" : `${v}${suf}`}</span>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── ANALYSIS LIST (commentaires RZ) ─────────────────────────────────────────
function AnalysisList({ isRZ, stores, store, analysisMap }) {
  if (isRZ) {
    return (
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {stores.map(s => analysisMap?.[s] && (
          <div key={s} style={{ fontSize: 12, color: C.text, padding: "8px 12px", background: C.bg, borderRadius: 8, lineHeight: 1.6 }}>
            <strong style={{ color: C.navy }}>{s} :</strong> {analysisMap[s]}
          </div>
        ))}
      </div>
    );
  }
  if (analysisMap?.[store]) {
    return (
      <div style={{ marginTop: 12, padding: "10px 14px", background: C.bg, borderRadius: 8, fontSize: 13, color: C.text, lineHeight: 1.7, borderLeft: `3px solid ${C.accent}` }}>
        💬 {analysisMap[store]}
      </div>
    );
  }
  return null;
}

// ─── RESULTS PAGE (Page 1 + Page 2) ──────────────────────────────────────────
function ResultsPage({ user, data, onRefresh, refreshing }) {
  const isRZ = user.role === "rz";
  const stores = isRZ ? STORES_ORDER : [user.store];
  const d = data?.page1, d2 = data?.page2;

  const TH = ({ children, a = "left" }) => <th style={{ textAlign: a, padding: "8px 10px", fontSize: 11, fontWeight: 700, color: C.gray400, textTransform: "uppercase", borderBottom: `2px solid ${C.gray50}`, whiteSpace: "nowrap" }}>{children}</th>;
  const TD = ({ children, a = "left", b }) => <td style={{ padding: "9px 10px", fontSize: 13, textAlign: a, fontWeight: b ? 700 : 400 }}>{children}</td>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.navy }}>Résultats commerciaux</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: C.gray400 }}>{data?.period} · données du {data?.updated}</p>
        </div>
        {isRZ && <Btn size="sm" variant="secondary" onClick={onRefresh} style={{ opacity: refreshing ? 0.6 : 1 }}>{refreshing ? "⏳ Synchro…" : "🔄 Actualiser depuis Notion"}</Btn>}
      </div>

      {/* ACCESSOIRES */}
      <Card>
        <SectionHead>🛒 Ratio Accessoires — Objectif ≥ 25%</SectionHead>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Magasin</TH><TH a="right">Marge Acc.</TH><TH a="right">Marge Tot.</TH><TH a="right">Ratio</TH><TH a="center">Tend.</TH><TH>Progression</TH></tr></thead>
            <tbody>
              {stores.map((s, i) => { const a = d?.accessoires?.[s]; if (!a) return null;
                return <tr key={s} style={{ background: i % 2 ? C.bg : C.white }}>
                  <TD b>{s}</TD><TD a="right">{eur(a.margeAcc)}</TD><TD a="right">{eur(a.margeTotal)}</TD>
                  <TD a="right"><span style={{ fontWeight: 800, color: statusC(a.status) }}>{a.ratio}%</span></TD>
                  <TD a="center" >{trendLabel(a.trend)}</TD><TD><Gauge value={a.ratio} max={40} target={25} color={statusC(a.status)} /></TD>
                </tr>; })}
            </tbody>
          </table>
        </div>
        <AnalysisList isRZ={isRZ} stores={stores} store={user.store} analysisMap={d?.analysis?.accessoires} />
      </Card>

      {/* GP */}
      <Card>
        <SectionHead>🛡️ Ratio Garantie Plus — Objectif ≥ 20%</SectionHead>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Magasin</TH><TH a="right">Marge GP</TH><TH a="right">Marge Tot.</TH><TH a="right">Ratio</TH><TH a="center">Tend.</TH><TH>Progression</TH></tr></thead>
            <tbody>
              {stores.map((s, i) => { const a = d?.gp?.[s]; if (!a) return null;
                return <tr key={s} style={{ background: i % 2 ? C.bg : C.white }}>
                  <TD b>{s}</TD><TD a="right">{eur(a.margeGP)}</TD><TD a="right">{eur(a.margeTotal)}</TD>
                  <TD a="right"><span style={{ fontWeight: 800, color: statusC(a.status) }}>{a.ratio}%</span></TD>
                  <TD a="center">{trendLabel(a.trend)}</TD><TD><Gauge value={a.ratio} max={35} target={20} color={statusC(a.status)} /></TD>
                </tr>; })}
            </tbody>
          </table>
        </div>
        <AnalysisList isRZ={isRZ} stores={stores} store={user.store} analysisMap={d?.analysis?.gp} />
      </Card>

      {/* OCCASION */}
      <Card>
        <SectionHead>📱 Mobiles d'Occasion — Objectifs différenciés</SectionHead>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Magasin</TH><TH a="right">Volume</TH><TH a="right">Marge</TH><TH a="right">Objectif</TH><TH a="right">%</TH><TH a="center">Tend.</TH><TH>Progression</TH></tr></thead>
            <tbody>
              {stores.map((s, i) => { const a = d?.occasion?.[s]; if (!a) return null;
                const pct = a.objectif ? Math.round((a.volume / a.objectif) * 100) : 0;
                const col = pct >= 100 ? C.ok : pct >= 60 ? C.warn : C.bad;
                return <tr key={s} style={{ background: i % 2 ? C.bg : C.white }}>
                  <TD b>{s}</TD><TD a="right"><span style={{ fontWeight: 800, color: col, fontSize: 15 }}>{a.volume}</span></TD>
                  <TD a="right">{eur(a.marge)}</TD><TD a="right" b>{a.objectif}</TD>
                  <TD a="right"><span style={{ fontWeight: 700, color: col }}>{pct}%</span></TD>
                  <TD a="center">{trendLabel(a.trend)}</TD><TD><Gauge value={a.volume} max={a.objectif} target={a.objectif} color={col} /></TD>
                </tr>; })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MOBILEO */}
      <Card>
        <SectionHead>📶 Forfaits Mobileo — Objectif 10-15 / magasin</SectionHead>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Magasin</TH><TH>Vendeurs</TH><TH a="right">Total</TH><TH a="center">Tend.</TH><TH>Progression</TH></tr></thead>
            <tbody>
              {stores.map((s, i) => { const a = d2?.mobileo?.[s]; if (!a) return null;
                const col = a.total >= 10 ? C.ok : a.total >= 6 ? C.warn : C.bad;
                return <tr key={s} style={{ background: i % 2 ? C.bg : C.white }}>
                  <TD b>{s}</TD>
                  <TD><div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {Object.entries(a.vendeurs || {}).map(([v, n]) => <span key={v} style={{ fontSize: 12 }}>{v} : <strong style={{ color: n > 0 ? C.ok : C.gray200 }}>{n}</strong></span>)}
                  </div></TD>
                  <TD a="right"><span style={{ fontWeight: 800, color: col, fontSize: 16 }}>{a.total}</span></TD>
                  <TD a="center">{trendLabel(a.trend)}</TD><TD><Gauge value={a.total} max={15} target={10} color={col} /></TD>
                </tr>; })}
            </tbody>
          </table>
        </div>
        <AnalysisList isRZ={isRZ} stores={stores} store={user.store} analysisMap={d2?.analysis?.mobileo} />
      </Card>

      {/* ATM */}
      <Card>
        <SectionHead>🔒 Assurances ATM — Objectif ≥ 10% des occ.</SectionHead>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Magasin</TH><TH a="right">ATM</TH><TH a="right">Mob. Occ.</TH><TH a="right">Ratio</TH><TH a="center">Tend.</TH><TH>Progression</TH></tr></thead>
            <tbody>
              {stores.map((s, i) => { const a = d2?.atm?.[s]; if (!a) return null;
                const col = a.status === "ok" ? C.ok : a.status === "low" ? C.gray400 : C.bad;
                return <tr key={s} style={{ background: i % 2 ? C.bg : C.white }}>
                  <TD b>{s}</TD><TD a="right"><span style={{ fontWeight: 800, color: a.total > 0 ? C.ok : C.bad }}>{a.total}</span></TD>
                  <TD a="right">{a.mobOcc}</TD><TD a="right"><span style={{ fontWeight: 800, color: col }}>{a.ratio}%</span></TD>
                  <TD a="center">{trendLabel(a.trend)}</TD><TD><Gauge value={a.ratio} max={25} target={10} color={col} /></TD>
                </tr>; })}
            </tbody>
          </table>
        </div>
        <AnalysisList isRZ={isRZ} stores={stores} store={user.store} analysisMap={d2?.analysis?.atm} />
      </Card>
    </div>
  );
}

// ─── VISITS PAGE ──────────────────────────────────────────────────────────────
function VisitsPage({ user, visits }) {
  const isRZ = user.role === "rz";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.navy }}>Comptes rendus de visites</h2>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: C.gray400 }}>Base Notion "Suivi Visites Magasins SAVE"</p>
      </div>
      {(!visits || visits.length === 0) ? (
        <Card><div style={{ textAlign: "center", padding: "28px 0", color: C.gray400 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 13 }}>{isRZ ? "Aucune visite récente." : "Aucun compte rendu publié pour votre magasin."}</div>
        </div></Card>
      ) : visits.map((v) => (
        <Card key={v.id} accent={C.accent}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Compte rendu</div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.navy }}>{v.title || v.store}</h3>
              <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>{v.date}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 12, background: v.published ? C.ok + "22" : C.warn + "22", color: v.published ? C.ok : C.warn, fontWeight: 700 }}>{v.published ? "Publié" : "Brouillon"}</span>
              {v.url && <a href={v.url} target="_blank" rel="noopener noreferrer"><Btn size="sm" variant="secondary">Ouvrir</Btn></a>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── GOAT — couleurs signature & primitives ───────────────────────────────────
const GOAT_GOLD   = "#F4B400";
const GOAT_SILVER = "#C9CDD3";
const GOAT_BRONZE = "#CD7F32";
const GOAT_FIRE   = "#FF4D2E";

function GoatKeyframes() {
  return (
    <style>{`
      @keyframes goatGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      @keyframes goatRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes goatPop   { 0% { transform: scale(0.85); opacity: 0; } 70% { transform: scale(1.04); } 100% { transform: scale(1); opacity: 1; } }
      @keyframes goatFlicker { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
      .goat-bar-fill { animation: goatGrow 0.7s cubic-bezier(.2,.9,.3,1) both; transform-origin: left; }
      .goat-card-in { animation: goatRise 0.45s ease both; }
      .goat-pop { animation: goatPop 0.5s cubic-bezier(.34,1.56,.64,1) both; }
      .goat-fire { animation: goatFlicker 1.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .goat-bar-fill, .goat-card-in, .goat-pop, .goat-fire { animation: none !important; }
      }
    `}</style>
  );
}

function GoatScoreBar({ label, value, max, color, delay = 0 }) {
  const pct = Math.min(100, ((value || 0) / max) * 100);
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.gray400, marginBottom: 3, fontWeight: 600 }}>
        <span>{label}</span><span style={{ fontWeight: 800, color: C.navy }}>{(value || 0).toFixed(1)}<span style={{ color: C.gray400, fontWeight: 600 }}>/{max}</span></span>
      </div>
      <div style={{ height: 6, background: C.gray50, borderRadius: 4, overflow: "hidden" }}>
        <div className="goat-bar-fill" style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}cc)`, borderRadius: 4, animationDelay: `${delay}ms` }} />
      </div>
    </div>
  );
}

function GoatMedal({ rank, size = 30 }) {
  const cfg = rank === 1 ? { grad: `linear-gradient(145deg, ${GOAT_GOLD}, #C98A00)`, ring: GOAT_GOLD, label: "🥇" }
            : rank === 2 ? { grad: `linear-gradient(145deg, ${GOAT_SILVER}, #8B8F96)`, ring: GOAT_SILVER, label: "🥈" }
            : rank === 3 ? { grad: `linear-gradient(145deg, ${GOAT_BRONZE}, #8C5524)`, ring: GOAT_BRONZE, label: "🥉" }
            : { grad: C.gray50, ring: C.gray200, label: null };
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: cfg.grad, color: rank <= 3 ? C.white : C.gray400,
      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: size * 0.4, flexShrink: 0,
      boxShadow: rank <= 3 ? `0 3px 8px ${cfg.ring}66` : "none", border: rank > 3 ? `1.5px solid ${C.gray200}` : "none",
    }}>
      {cfg.label || rank}
    </div>
  );
}

function GoatPodium({ top3 }) {
  if (!top3 || top3.length < 1) return null;
  const order = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const heights = top3.length >= 3 ? [128, 168, 100] : top3.map((_, i) => 168 - i * 30);
  const podiumColors = [GOAT_SILVER, GOAT_GOLD, GOAT_BRONZE];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10, padding: "18px 8px 0" }}>
      {order.map((v, i) => {
        const rank = top3.length >= 3 ? [2, 1, 3][i] : i + 1;
        const h = heights[i];
        const col = top3.length >= 3 ? podiumColors[i] : podiumColors[rank - 1];
        return (
          <div key={v.name} className="goat-pop" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 96, animationDelay: `${i * 110}ms` }}>
            <GoatMedal rank={rank} size={36} />
            <div style={{ marginTop: 8, fontWeight: 800, fontSize: 13, color: C.white, textAlign: "center", lineHeight: 1.2 }}>{v.name}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>{v.store}</div>
            <div style={{
              width: "100%", height: h, borderRadius: "10px 10px 4px 4px",
              background: `linear-gradient(180deg, ${col}, ${col}99)`,
              display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 10,
              boxShadow: `0 4px 14px ${col}55`,
            }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: C.white }}>{v.total}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GoatRankRow({ v, rank, index }) {
  const isLeader = rank === 1;
  return (
    <div className="goat-card-in" style={{
      display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
      background: isLeader ? `linear-gradient(90deg, ${GOAT_GOLD}1c, transparent)` : (index % 2 === 0 ? C.white : C.bg),
      borderRadius: 10, border: isLeader ? `1.5px solid ${GOAT_GOLD}66` : "1px solid transparent",
      animationDelay: `${index * 60}ms`,
    }}>
      <GoatMedal rank={rank} />
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: C.navy, display: "flex", alignItems: "center", gap: 6 }}>
          {v.name}
          {v.isSolo && <span style={{ fontSize: 9, fontWeight: 700, color: C.accent, background: C.accent + "18", padding: "1px 6px", borderRadius: 8 }}>SOLO +10%</span>}
        </div>
        <div style={{ fontSize: 11, color: C.gray400 }}>{v.store}</div>
      </div>
      <div style={{ width: 168, minWidth: 150, display: "none", flexDirection: "column" }} className="goat-detail-desktop">
        <GoatScoreBar label="Acc." value={v.breakdown?.accessoires} max={25} color={C.accent} delay={index * 60} />
        <GoatScoreBar label="GP" value={v.breakdown?.gp} max={25} color={C.accentB} delay={index * 60 + 40} />
        <GoatScoreBar label="Mobileo" value={v.breakdown?.mobileo} max={30} color={C.ok} delay={index * 60 + 80} />
        <GoatScoreBar label="ATM" value={v.breakdown?.atm} max={20} color={C.warn} delay={index * 60 + 120} />
      </div>
      <div style={{ textAlign: "center", minWidth: 54 }}>
        <div style={{ fontSize: 21, fontWeight: 900, color: isLeader ? GOAT_GOLD : C.navy }}>{v.total}</div>
        <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.04em" }}>/ 100</div>
      </div>
    </div>
  );
}

function GoatRankingPanel({ title, subtitle, scores, icon }) {
  const sorted = [...(scores || [])].sort((a, b) => b.total - a.total);
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  return (
    <Card style={{ overflow: "hidden", padding: 0 }}>
      <div style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.navyMid})`, padding: "16px 18px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: C.white }}>{title}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{subtitle}</div>
          </div>
        </div>
        {sorted.length > 0 ? <GoatPodium top3={top3} /> : (
          <div style={{ padding: "20px 0 18px", textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Pas encore de données pour cette période.</div>
        )}
      </div>
      {sorted.length > 0 && (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {top3.map((v, i) => <GoatRankRow key={v.name} v={v} rank={i + 1} index={i} />)}
          {rest.map((v, i) => <GoatRankRow key={v.name} v={v} rank={i + 4} index={i + 3} />)}
        </div>
      )}
      <style>{`
        @media (min-width: 600px) {
          .goat-detail-desktop { display: flex !important; }
        }
      `}</style>
    </Card>
  );
}

function GoatPage({ user, goatData, onRefresh, refreshing }) {
  const isRZ = user.role === "rz";
  const data = goatData || GOAT_DATA_FALLBACK;
  const seasonPoints = computeGoatSeasonPoints(data.titlesHistory);
  const goat = seasonPoints[0];
  const streak = computeCurrentStreak(data.titlesHistory);
  const showStreak = streak && streak.count >= 3;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <GoatKeyframes />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: C.navy, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>🐐</span> GOAT — Classement vendeurs
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: C.gray400 }}>
            Mix produit : Accessoires (25) · GP (25) · Mobileo (30) · ATM (20) — score sur 100, plafonné par objectif
          </p>
        </div>
        {isRZ && <Btn size="sm" variant="secondary" onClick={onRefresh} style={{ opacity: refreshing ? 0.6 : 1 }}>{refreshing ? "⏳ Synchro…" : "🔄 Actualiser depuis Notion"}</Btn>}
      </div>

      {/* Hero — GOAT de la saison */}
      <div className="goat-pop" style={{
        position: "relative", overflow: "hidden", borderRadius: 16,
        background: `radial-gradient(circle at 18% 20%, ${C.accent}33, transparent 55%), linear-gradient(135deg, ${C.navy}, #1c1c1c)`,
        padding: "22px 22px",
        boxShadow: `0 10px 30px rgba(0,0,0,0.35)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
            background: `linear-gradient(145deg, ${GOAT_GOLD}, #C98A00)`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
            boxShadow: `0 6px 18px ${GOAT_GOLD}55`,
          }}>🐐</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: C.accentB, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800 }}>GOAT de la saison · Juin 2025 – Mai 2026</div>
            {goat ? (
              <>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.white, marginTop: 3, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {goat.name}
                  {showStreak && streak.name === goat.name && (
                    <span className="goat-fire" style={{ fontSize: 13, fontWeight: 800, color: GOAT_FIRE, background: GOAT_FIRE + "22", padding: "3px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      🔥 {streak.count} mois consécutifs
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{goat.store} · {goat.months} titre{goat.months > 1 ? "s" : ""} mensuel{goat.months > 1 ? "s" : ""} · {goat.weeks} titre{goat.weeks > 1 ? "s" : ""} hebdo</div>
              </>
            ) : <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>Aucun titre attribué pour le moment.</div>}
          </div>
          {goat && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 38, fontWeight: 900, color: GOAT_GOLD, lineHeight: 1 }}>{goat.points}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>points saison</div>
            </div>
          )}
        </div>
      </div>

      {/* Classement saison complet */}
      <Card>
        <SectionHead>🏁 Classement saison — points cumulés (1 pt/MVP semaine · 3 pts/MVP mois)</SectionHead>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {seasonPoints.length === 0 && <div style={{ fontSize: 12, color: C.gray400 }}>Pas encore de titres attribués cette saison.</div>}
          {seasonPoints.map((p, i) => (
            <div key={p.name} className="goat-card-in" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", background: i === 0 ? `linear-gradient(90deg, ${GOAT_GOLD}1c, transparent)` : C.bg, borderRadius: 9, animationDelay: `${i * 50}ms` }}>
              <GoatMedal rank={i + 1} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.navy }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.gray400 }}>{p.store}</div>
              </div>
              <div style={{ fontSize: 11, color: C.gray400, textAlign: "right", minWidth: 120 }}>
                {p.months > 0 && <span>🏆 {p.months} mois</span>}{p.months > 0 && p.weeks > 0 && " · "}{p.weeks > 0 && <span>⭐ {p.weeks} sem.</span>}
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: i === 0 ? GOAT_GOLD : C.navy, minWidth: 38, textAlign: "right" }}>{p.points}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* MVP du mois (dernier mois clôturé) */}
      <GoatRankingPanel title="Meilleur vendeur du mois" subtitle={data.monthly?.label || "—"} scores={data.monthly?.scores} icon="🏆" />

      {/* MVP de la semaine */}
      <GoatRankingPanel title="MVP de la semaine" subtitle={data.weekly?.label || "—"} scores={data.weekly?.scores} icon="⭐" />

      {/* Historique des titres */}
      <Card>
        <SectionHead>📜 Historique des titres — saison en cours</SectionHead>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(data.titlesHistory || []).map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "8px 12px", background: i % 2 === 0 ? C.white : C.bg, borderRadius: 7 }}>
              <span style={{ color: C.gray400 }}>{t.type === "month" ? "🏆 Mois" : "⭐ Semaine"} — {t.label}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, color: C.navy }}>{t.winner}</span>
                <span style={{ fontSize: 11, color: C.gray400 }}>{t.score}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card accent={C.accent}>
        <div style={{ fontSize: 12, color: C.gray600, lineHeight: 1.7 }}>
          <strong style={{ color: C.navy }}>ℹ️ Méthode de calcul :</strong> chaque KPI est plafonné à 100% de son objectif individuel, donc un vendeur ne peut pas compenser un produit faible en écrasant les autres en volume — c'est le mix complet qui est récompensé. L'objectif Mobileo individuel = objectif magasin (12, milieu de fourchette 10–15) ÷ nombre de vendeurs actifs du magasin. Les vendeurs en magasin solo (Chalon, Besançon) reçoivent un bonus de +10% sur leur score final car ils portent l'intégralité de l'activité sans relais.
        </div>
      </Card>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [results, setResults] = useState(null);
  const [visits, setVisits] = useState(null);
  const [goatData, setGoatData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadAll = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const [r, v, g] = await Promise.all([
        api.get(`/api/results${refresh ? "?refresh=1" : ""}`),
        api.get(`/api/visits${refresh ? "?refresh=1" : ""}`),
        api.get(`/api/goat${refresh ? "?refresh=1" : ""}`),
      ]);
      setResults(r);
      setVisits(v.visits);
      setGoatData(g);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (user) loadAll(); }, [user, loadAll]);

  if (!user) return <LoginScreen onLogin={(u) => { setUser(u); setPage("dashboard"); }} />;

  const nav = [
    { id: "dashboard", label: "Vue d'ensemble", icon: "📊" },
    { id: "results", label: "Résultats", icon: "📈" },
    { id: "goat", label: "GOAT", icon: "🐐" },
    { id: "visits", label: "Visites", icon: "📋" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: C.text }}>
      <style>{`* { box-sizing: border-box; } a { text-decoration: none; }`}</style>
      <nav style={{ background: C.navy, padding: "0 20px", display: "flex", alignItems: "center", height: 54, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.25)", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginRight: 20, flexShrink: 0 }}>
          <RepairMobileLogo size={32} />
          <div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 800, lineHeight: 1 }}>REPAIR<span style={{ color: C.accentB }}>MOBILE</span></div>
            <div style={{ color: C.accentB, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>SAVE Réseau</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, flex: 1, overflowX: "auto" }}>
          {nav.map(({ id, label, icon }) => (
            <button key={id} onClick={() => setPage(id)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: page === id ? C.accent : "transparent", color: page === id ? C.white : C.gray400, fontSize: 12, fontWeight: page === id ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>{icon} {label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.white, fontSize: 11, fontWeight: 600 }}>{user.name}</div>
            <div style={{ color: C.accentB, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>{user.role === "rz" ? "Resp. de Zone" : "Magasin"}</div>
          </div>
          <button onClick={() => { api.token = null; setUser(null); }} style={{ padding: "4px 9px", borderRadius: 6, border: `1px solid ${C.navyL}`, background: "transparent", color: C.gray400, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>⏏</button>
        </div>
      </nav>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 18px" }}>
        {error && <div style={{ marginBottom: 16 }}><ErrorBanner message={error} onRetry={() => loadAll()} /></div>}
        {loading ? <Spinner label="Lecture des données Notion…" /> : (
          <>
            {page === "dashboard" && results && <Dashboard user={user} data={results} />}
            {page === "results" && results && <ResultsPage user={user} data={results} onRefresh={() => loadAll(true)} refreshing={refreshing} />}
            {page === "goat" && <GoatPage user={user} goatData={goatData} onRefresh={() => loadAll(true)} refreshing={refreshing} />}
            {page === "visits" && <VisitsPage user={user} visits={visits} />}
            {!results && !error && <Spinner />}
          </>
        )}
      </main>
    </div>
  );
}
