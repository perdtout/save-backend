// ─── server.js ───────────────────────────────────────────────────────────────
// API REST de pilotage SAVE — Juvi-Group
import "dotenv/config";
import express from "express";
import cors from "cors";
import { fetchResultsData, fetchVisits, fetchHistory, fetchGoatBundle, fetchActions, fetchProcess } from "./notion.js";
import { login, requireAuth, filterForUser } from "./auth.js";
import { fetchDossiers, createDossier, updateDossier, clotureDossier, indicateurs } from "./atm.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// ─── Cache mémoire simple ────────────────────────────────────────────────────
const CACHE_TTL = (parseInt(process.env.CACHE_TTL) || 300) * 1000;
const cache = {
  results: { data: null, ts: 0 },
  visits:  { data: null, ts: 0 },
  history: { data: null, ts: 0 },
  goatBundle: { data: null, ts: 0 },
  actions: { data: null, ts: 0 },
  process: { data: null, ts: 0 },
};
// Les dossiers ATM sont filtrés par magasin : une entrée de cache par magasin,
// plus une entrée "zone" pour le responsable de zone.
const atmCache = {};
let goatBundleRequest = null;

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

async function getGoatBundle(force = false) {
  const now = Date.now();
  if (!force && cache.goatBundle.data && now - cache.goatBundle.ts < CACHE_TTL) return cache.goatBundle.data;
  // /api/goat et /api/vendors arrivent en parallèle depuis le frontend.
  // Ils partagent la même promesse pour ne lire la collection Notion qu'une fois.
  if (!goatBundleRequest) {
    goatBundleRequest = fetchGoatBundle()
      .then(data => {
        cache.goatBundle = { data, ts: Date.now() };
        return data;
      })
      .finally(() => { goatBundleRequest = null; });
  }
  return goatBundleRequest;
}

async function getActions(force = false) {
  const now = Date.now();
  if (!force && cache.actions.data && now - cache.actions.ts < CACHE_TTL) return cache.actions.data;
  const data = await fetchActions();
  cache.actions = { data, ts: now };
  return data;
}

async function getProcess(force = false) {
  const now = Date.now();
  if (!force && cache.process.data && now - cache.process.ts < CACHE_TTL) return cache.process.data;
  const data = await fetchProcess();
  cache.process = { data, ts: now };
  return data;
}

async function getAtm(store, force = false) {
  const key = store || "zone";
  const now = Date.now();
  const hit = atmCache[key];
  if (!force && hit?.data && now - hit.ts < CACHE_TTL) return hit.data;
  const { dossiers, configured } = await fetchDossiers({ store });
  const data = { configured, dossiers, indicateurs: indicateurs(dossiers) };
  atmCache[key] = { data, ts: now };
  return data;
}

// Sans ça, le technicien coche une case et son écran ne bouge pas pendant cinq
// minutes. On vide toutes les entrées : un dossier compte dans la liste de son
// magasin et dans celle de la zone.
function invalidateAtm() {
  for (const k of Object.keys(atmCache)) delete atmCache[k];
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// Santé + diagnostic de configuration
// Ne renvoie jamais de valeur secrète : uniquement la présence ou l'absence de
// chaque variable, pour vérifier une configuration sans ouvrir Render.
app.get("/api/health", (req, res) => res.json({
  ok: true,
  service: "SAVE Pilotage API",
  config: {
    notionToken:  !!process.env.NOTION_TOKEN,
    page1:        !!process.env.NOTION_PAGE1_ID,
    page2:        !!process.env.NOTION_PAGE2_ID,
    visitsDb:     !!process.env.NOTION_VISITS_DB_ID,
    historyDb:    !!process.env.NOTION_HISTORY_DB_ID,
    goatDb:       !!process.env.NOTION_GOAT_DB_ID,
    actionsDb:    !!process.env.NOTION_ACTIONS_DB_ID,
    processDb:    !!process.env.NOTION_PROCESS_DB_ID,
    atmDb:        !!process.env.NOTION_ATM_DB_ID,
  },
}));

// Diagnostic de lecture de la base des plans d'action (RZ uniquement).
// Distingue les trois causes possibles : variable absente, base non partagée
// avec l'intégration, ou base simplement vide.
app.get("/api/actions/debug", requireAuth, async (req, res) => {
  if (req.user.role !== "rz") return res.status(403).json({ error: "Réservé au RZ" });
  if (!process.env.NOTION_ACTIONS_DB_ID) {
    return res.json({ ok: false, cause: "NOTION_ACTIONS_DB_ID absent des variables d'environnement" });
  }
  try {
    const actions = await fetchActions();
    res.json({
      ok: true,
      id: process.env.NOTION_ACTIONS_DB_ID,
      total: actions.length,
      publiees: actions.filter(a => a.published).length,
      parMagasin: actions.reduce((acc, a) => ({ ...acc, [a.store]: (acc[a.store] || 0) + 1 }), {}),
      cause: actions.length ? null : "Base lue mais vide, ou lignes sans titre/magasin",
    });
  } catch (e) {
    res.status(502).json({
      ok: false,
      id: process.env.NOTION_ACTIONS_DB_ID,
      cause: "Lecture Notion refusée — l'intégration n'a probablement pas accès à la base, ou l'identifiant n'est pas le bon",
      detail: e.message,
    });
  }
});

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
    const data = await getGoatBundle(force);
    res.json(data.goat);
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
    const data = (await getGoatBundle(force)).vendors;
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

// Bibliothèque des process
// Les magasins ne voient que les process publiés ; le RZ voit tout, avec l'état
// de publication, pour pouvoir vérifier ce que ses équipes ont sous les yeux.
app.get("/api/process", requireAuth, async (req, res) => {
  try {
    const force = req.query.refresh === "1" && req.user.role === "rz";
    let items = await getProcess(force);
    if (req.user.role !== "rz") items = items.filter(p => p.published);
    res.json({ process: items });
  } catch (e) {
    console.error("Erreur /api/process:", e.message);
    res.status(502).json({ error: "Lecture Notion impossible", detail: e.message });
  }
});

// ─── Dossiers ATM ────────────────────────────────────────────────────────────
// Premières routes d'écriture de l'app. Le magasin d'un compte n'est jamais lu
// depuis le corps de la requête : il vient du jeton, et atm.js le revérifie.

app.get("/api/atm", requireAuth, async (req, res) => {
  try {
    const store = req.user.role === "rz" ? null : req.user.store;
    const force = req.query.refresh === "1";
    res.json(await getAtm(store, force));
  } catch (e) {
    console.error("Erreur /api/atm:", e.message);
    res.status(502).json({ error: "Lecture Notion impossible", detail: e.message });
  }
});

app.post("/api/atm", requireAuth, async (req, res) => {
  try {
    const store = req.user.role === "rz" ? null : req.user.store;
    const dossier = await createDossier(req.body, { store });
    invalidateAtm();
    res.status(201).json(dossier);
  } catch (e) {
    console.error("Erreur POST /api/atm:", e.message);
    res.status(e.status || 502).json({ error: e.message });
  }
});

app.patch("/api/atm/:id", requireAuth, async (req, res) => {
  try {
    const store = req.user.role === "rz" ? null : req.user.store;
    const dossier = await updateDossier(req.params.id, req.body, { store });
    invalidateAtm();
    res.json(dossier);
  } catch (e) {
    console.error("Erreur PATCH /api/atm:", e.message);
    res.status(e.status || 502).json({ error: e.message });
  }
});

// Clôture = archivage. La ligne reste dans Notion avec sa date de remise.
app.post("/api/atm/:id/cloture", requireAuth, async (req, res) => {
  try {
    const store = req.user.role === "rz" ? null : req.user.store;
    const dossier = await clotureDossier(req.params.id, req.body, { store });
    invalidateAtm();
    res.json(dossier);
  } catch (e) {
    console.error("Erreur clôture /api/atm:", e.message);
    res.status(e.status || 502).json({ error: e.message });
  }
});

// Vide le cache (RZ uniquement)
app.post("/api/refresh", requireAuth, async (req, res) => {
  if (req.user.role !== "rz") return res.status(403).json({ error: "Réservé au RZ" });
  cache.results = { data: null, ts: 0 };
  cache.visits  = { data: null, ts: 0 };
  cache.history = { data: null, ts: 0 };
  cache.goatBundle = { data: null, ts: 0 };
  cache.actions = { data: null, ts: 0 };
  cache.process = { data: null, ts: 0 };
  invalidateAtm();
  res.json({ ok: true, message: "Cache vidé. Prochaine requête relit Notion." });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API SAVE Pilotage en écoute sur http://localhost:${PORT}`);
  console.log(`   Pages Notion : P1=${process.env.NOTION_PAGE1_ID?.slice(0,8)}… P2=${process.env.NOTION_PAGE2_ID?.slice(0,8)}…`);
  console.log(`   GOAT DB : ${process.env.NOTION_GOAT_DB_ID?.slice(0,8)}…`);
  console.log(`   ATM DB  : ${process.env.NOTION_ATM_DB_ID?.slice(0,8) || "non configuree"}…`);
});
