import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIGURATION — change cette URL pour pointer vers ton backend
//  En local : "http://localhost:3001"
//  En ligne : "https://ton-app.up.railway.app" (ou Render/Fly)
// ═══════════════════════════════════════════════════════════════════════════
const API_URL = "http://localhost:3001";

// ─── DESIGN TOKENS — Juvi-Group ──────────────────────────────────────────────
const C = {
  navy: "#0D1F3C", navyMid: "#162845", navyL: "#1E3A5F",
  accent: "#2D7DD2", accentB: "#4FA3F7", white: "#FFFFFF",
  bg: "#F4F7FB", gray50: "#EEF2F7", gray200: "#C8D4E3",
  gray400: "#7A92AD", gray600: "#4A6278",
  ok: "#22C55E", warn: "#F59E0B", bad: "#EF4444", text: "#0D1F3C",
};

const STORES_ORDER = ["Pontarlier", "Lons-le-Saunier", "Dijon", "Besançon", "Chalon-sur-Saône"];

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
          <div style={{ width: 38, height: 38, borderRadius: 9, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: C.white, fontSize: 20, fontWeight: 900, fontFamily: "Georgia, serif" }}>J</span>
          </div>
          <div>
            <div style={{ color: C.white, fontSize: 17, fontWeight: 800, letterSpacing: "0.04em" }}>JUVI<span style={{ color: C.accentB }}>GROUP</span></div>
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

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [results, setResults] = useState(null);
  const [visits, setVisits] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadAll = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const [r, v] = await Promise.all([
        api.get(`/api/results${refresh ? "?refresh=1" : ""}`),
        api.get(`/api/visits${refresh ? "?refresh=1" : ""}`),
      ]);
      setResults(r);
      setVisits(v.visits);
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
    { id: "visits", label: "Visites", icon: "📋" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: C.text }}>
      <style>{`* { box-sizing: border-box; } a { text-decoration: none; }`}</style>
      <nav style={{ background: C.navy, padding: "0 20px", display: "flex", alignItems: "center", height: 54, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.25)", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginRight: 20, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: C.white, fontSize: 17, fontWeight: 900, fontFamily: "Georgia,serif" }}>J</span>
          </div>
          <div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 800, lineHeight: 1 }}>JUVI<span style={{ color: C.accentB }}>GROUP</span></div>
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
            {page === "visits" && <VisitsPage user={user} visits={visits} />}
            {!results && !error && <Spinner />}
          </>
        )}
      </main>
    </div>
  );
}
