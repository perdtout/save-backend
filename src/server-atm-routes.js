// ─────────────────────────────────────────────────────────────────────────────
//  À INSÉRER DANS src/server.js
//  Routes ATM — les premières routes d'écriture de l'app.
//  Rien d'autre à modifier dans server.js que ces trois blocs.
// ─────────────────────────────────────────────────────────────────────────────


// ══ BLOC 1 — en haut du fichier, avec les autres require ═════════════════════

const atm = require("./atm");


// ══ BLOC 2 — avec les autres routes, après /api/process ══════════════════════

/**
 * Lecture. Le cache reste utile ici : plusieurs techniciens rechargent la même
 * liste. Clé distincte par magasin, sinon Besançon verrait la liste de Dijon.
 */
app.get("/api/atm", auth, async (req, res) => {
  try {
    const store = req.user.role === "rz" ? null : req.user.store;
    const cacheKey = `atm:${store || "zone"}`;

    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const { dossiers, configured } = await atm.fetchDossiers({ store });
    const payload = {
      configured,
      dossiers,
      indicateurs: atm.indicateurs(dossiers),
    };
    setCache(cacheKey, payload);
    res.json(payload);
  } catch (e) {
    console.error("[/api/atm]", e.message);
    res.status(500).json({ error: "Impossible de charger les dossiers ATM." });
  }
});

/** Ouverture d'un dossier. */
app.post("/api/atm", auth, async (req, res) => {
  try {
    const store = req.user.role === "rz" ? null : req.user.store;
    const dossier = await atm.createDossier(req.body, { store });
    invalidateAtm(req.user);
    res.status(201).json(dossier);
  } catch (e) {
    console.error("[POST /api/atm]", e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** Avancement : cases cochées, choix de branche, dates, montant. */
app.patch("/api/atm/:id", auth, async (req, res) => {
  try {
    const store = req.user.role === "rz" ? null : req.user.store;
    const dossier = await atm.updateDossier(req.params.id, req.body, { store });
    invalidateAtm(req.user);
    res.json(dossier);
  } catch (e) {
    console.error("[PATCH /api/atm]", e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** Clôture = archivage. La ligne reste dans Notion, elle sort de la liste. */
app.post("/api/atm/:id/cloture", auth, async (req, res) => {
  try {
    const store = req.user.role === "rz" ? null : req.user.store;
    const dossier = await atm.clotureDossier(req.params.id, req.body, { store });
    invalidateAtm(req.user);
    res.json(dossier);
  } catch (e) {
    console.error("[POST /api/atm/cloture]", e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});


// ══ BLOC 3 — utilitaire, à placer près des fonctions de cache ════════════════

/**
 * Sans ça, le technicien coche une case et l'écran ne bouge pas pendant 5
 * minutes. On vide la clé du magasin concerné ET la clé zone, puisque le
 * dossier compte dans les deux listes.
 */
function invalidateAtm(user) {
  clearCache(`atm:${user.store || "zone"}`);
  clearCache("atm:zone");
}


// ══ BLOC 4 — dans la réponse de /api/health, avec processDb ══════════════════

//   atmDb: Boolean(process.env.NOTION_ATM_DB_ID),


// ─────────────────────────────────────────────────────────────────────────────
//  Note sur les fonctions de cache
//  server.js expose déjà un cache à 4 clés (results / visits / history / goat),
//  puis 5 avec process. Si l'implémentation actuelle n'a pas de fonction
//  `clearCache(key)`, il suffit d'ajouter à côté de getCache / setCache :
//
//    function clearCache(key) { delete cache[key]; }
//
//  C'est la seule dépendance de ce bloc au code existant.
// ─────────────────────────────────────────────────────────────────────────────
