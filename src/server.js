// ─── server.js ───────────────────────────────────────────────────────────────
// API REST de pilotage SAVE — Juvi-Group
import "dotenv/config";
import express from "express";
import cors from "cors";
import { fetchResultsData, fetchVisits, fetchHistory, fetchGoatData, fetchVendorsMTD, fetchActions } from "./notion.js";
import { login, requireAuth, filterForUser } from "./auth.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// ─── Cache mémoire simple ────────────────────────────────────────────────────
const CACHE_TTL = (parseInt(process.env.CACHE_TTL) || 300) * 1000;
const cache = {
  results: { data: null, ts: 0 },
  visits:  { data: null, ts: 0 },
  history: { data: null, ts: 0 },
  goat:    { data: null, ts: 0 },
  vendors: { data: null, ts: 0 },
  actions: { data: null, ts: 0 },
};

async function getResults(force = false) {
  const now = Date.now();
  if (!force && cache.results.data && now - cache.results.ts < CACHE_TTL) return cache.results.data;
  const data = await fetchResultsData();
  cache.results = { data, ts: now };
  return data;
}

async function getVisits(force = false) {
  const now = Date.now();
  if (!force && cache.visits.data && now - cache.visits.ts < CACHE_TTL) return cache.visits.data;
  const data = await fetchVisits();
  cache.visits = { data, ts: now };
  return data;
}

async function getHistory(force = false) {
  const now = Date.now();
  if (!force && cache.history.data && now - cache.history.ts < CACHE_TTL) return cache.history.data;
  const data = await fetchHistory();
  cache.history = { data, ts: now };
  return data;
}

async function getGoat(force = false) {
  const now = Date.now();
  if (!force && cache.goat.data && now - cache.goat.ts < CACHE_TTL) return cache.goat.data;
  const data = await fetchGoatData();
  cache.goat = { data, ts: now };
  return data;
}

async function getVendors(force = false) {
  const now = Date.now();
  if (!force && cache.vendors.data && now - cache.vendors.ts < CACHE_TTL) return cache.vendors.data;
  const data = await fetchVendorsMTD();
  cache.vendors = { data, ts: now };
  return data;
}

async function getActions(force = false) {
  const now = Date.now();
  if (!force && cache.actions.data && now - cache.actions.ts < CACHE_TTL) return cache.actions.data;
  const data = await fetchActions();
  cache.actions = { data, ts: now };
  return data;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Santé
app.get("/api/health", (req, res) => res.json({ ok: true, service: "SAVE Pilotage API" }));

// Connexion
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const result = login(username, password);
  if (!result) return res.status(401).json({ error: "Identifiants incorrects" });
  res.json(result);
});

// Résultats commerciaux
app.get("/api/results", requireAuth, async (req, res) => {
  try {
    const force = req.query.refresh === "1" && req.user.role === "rz";
    const data = await getResults(force);
    res.json(filterForUser(data, req.user));
  } catch (e) {
    console.error("Erreur /api/results:", e.message);
    res.status(502).json({ error: "Lecture Notion impossible", detail: e.message });
  }
});

// Visites
app.get("/api/visits", requireAuth, async (req, res) => {
  try {
    const force = req.query.refresh === "1" && req.user.role === "rz";
    let visits = await getVisits(force);
    if (req.user.role !== "rz") {
      visits = visits.filter(v => v.store === req.user.store && v.published);
    }
    res.json({ visits });
  } catch (e) {
    console.error("Erreur /api/visits:", e.message);
    res.status(502).json({ error: "Lecture Notion impossible", detail: e.message });
  }
});

// Historique mensuel
app.get("/api/history", requireAuth, async (req, res) => {
  try {
    const force = req.query.refresh === "1" && req.user.role === "rz";
    const data = await getHistory(force);
    if (req.user.role !== "rz") {
      const store = req.user.store;
      const byStore = data.byStore[store] ? { [store]: data.byStore[store] } : {};
      return res.json({ months: data.months, byStore });
    }
    res.json({ months: data.months, byStore: data.byStore });
  } catch (e) {
    console.error("Erreur /api/history:", e.message);
    res.status(502).json({ error: "Lecture Notion impossible", detail: e.message });
  }
});

// GOAT — classement individuel des vendeurs
// Accessible à tous les utilisateurs authentifiés.
// Les magasins voient l'onglet en lecture seule (leurs propres données sont incluses).
app.get("/api/goat", requireAuth, async (req, res) => {
  try {
    const force = req.query.refresh === "1" && req.user.role === "rz";
    const data = await getGoat(force);
    res.json(data);
  } catch (e) {
    console.error("Erreur /api/goat:", e.message);
    res.status(502).json({ error: "Lecture Notion impossible", detail: e.message });
  }
});

// Résultats par vendeur — cumul du mois en cours
// Un magasin ne voit que ses propres vendeurs.
app.get("/api/vendors", requireAuth, async (req, res) => {
  try {
    const force = req.query.refresh === "1" && req.user.role === "rz";
    const data = await getVendors(force);
    if (req.user.role !== "rz") {
      return res.json({ periode: data.periode, vendors: data.vendors.filter(v => v.store === req.user.store) });
    }
    res.json(data);
  } catch (e) {
    console.error("Erreur /api/vendors:", e.message);
    res.status(502).json({ error: "Lecture Notion impossible", detail: e.message });
  }
});

// Plans d'action magasins
// Le magasin ne voit que ses actions publiées ; le RZ voit tout.
app.get("/api/actions", requireAuth, async (req, res) => {
  try {
    const force = req.query.refresh === "1" && req.user.role === "rz";
    let actions = await getActions(force);
    if (req.user.role !== "rz") {
      actions = actions.filter(a => a.store === req.user.store && a.published);
    }
    res.json({ actions });
  } catch (e) {
    console.error("Erreur /api/actions:", e.message);
    res.status(502).json({ error: "Lecture Notion impossible", detail: e.message });
  }
});

// Vide le cache (RZ uniquement)
app.post("/api/refresh", requireAuth, async (req, res) => {
  if (req.user.role !== "rz") return res.status(403).json({ error: "Réservé au RZ" });
  cache.results = { data: null, ts: 0 };
  cache.visits  = { data: null, ts: 0 };
  cache.history = { data: null, ts: 0 };
  cache.goat    = { data: null, ts: 0 };
  cache.vendors = { data: null, ts: 0 };
  cache.actions = { data: null, ts: 0 };
  res.json({ ok: true, message: "Cache vidé. Prochaine requête relit Notion." });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API SAVE Pilotage en écoute sur http://localhost:${PORT}`);
  console.log(`   Pages Notion : P1=${process.env.NOTION_PAGE1_ID?.slice(0,8)}… P2=${process.env.NOTION_PAGE2_ID?.slice(0,8)}…`);
  console.log(`   GOAT DB : ${process.env.NOTION_GOAT_DB_ID?.slice(0,8)}…`);
});
