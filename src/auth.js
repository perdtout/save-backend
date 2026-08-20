// ─── auth.js ─────────────────────────────────────────────────────────────────
// Connexion + jetons JWT.
//
// Deux changements par rapport à la version précédente :
//
// 1. LES MOTS DE PASSE NE SONT PLUS DANS LE CODE. Chaque compte lit son
//    empreinte bcrypt dans une variable d'environnement. Pour générer une
//    empreinte : `node scripts/hash.js` (le mot de passe n'est jamais écrit
//    dans un fichier, ni transmis à qui que ce soit).
//
// 2. DEUX COMPTES NOMINATIFS s'ajoutent aux comptes magasin : `jerome`, qui
//    porte le rôle de tuteur, et `maelle`, dont les droits sont volontairement
//    étroits. Les cinq comptes magasin restent en place et ne changent pas.
//
// Le rôle de tuteur n'est pas un rôle global : c'est le champ `tutorOf` qui
// désigne l'alternante suivie. Quand Pontarlier ouvrira une alternance, il
// suffira d'ajouter un compte avec `tutorOf: "…"`, sans toucher au reste.
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export const ACCOUNTS = {
  "thomas.desternes": {
    role: "rz",
    name: "Thomas Desternes",
    env: "PWD_THOMAS",
  },

  // ── Comptes magasin (partagés par l'équipe, lecture seule sur l'alternance)
  dijon:      { role: "store", store: "Dijon",             name: "Dijon",             env: "PWD_DIJON" },
  lons:       { role: "store", store: "Lons-le-Saunier",   name: "Lons-le-Saunier",   env: "PWD_LONS" },
  pontarlier: { role: "store", store: "Pontarlier",        name: "Pontarlier",        env: "PWD_PONTARLIER" },
  chalon:     { role: "store", store: "Chalon-sur-Saône",  name: "Chalon-sur-Saône",  env: "PWD_CHALON" },
  besancon:   { role: "store", store: "Besançon",          name: "Besançon",          env: "PWD_BESANCON" },

  // ── Comptes nominatifs
  jerome: {
    role: "store",
    store: "Lons-le-Saunier",
    name: "Jérôme",
    env: "PWD_JEROME",
    // Désigne l'alternante dont il est le maître d'apprentissage. C'est ce
    // champ, et lui seul, qui ouvre le droit d'écriture sur son suivi.
    tutorOf: "Maëlle Martin",
  },
  maelle: {
    role: "apprentice",
    store: "Lons-le-Saunier",
    name: "Maëlle Martin",
    env: "PWD_MAELLE",
    // Avant cette date, elle ne voit ni le GOAT, ni les résultats du magasin,
    // ni les commentaires. Elle voit son parcours et ses propres compteurs.
    storeDataFrom: "2027-03-01",
  },
};

/**
 * Vérifie le mot de passe contre l'empreinte bcrypt de la variable
 * d'environnement du compte. Un compte dont la variable est absente ne peut
 * pas se connecter : c'est volontaire, mieux vaut un refus qu'un accès ouvert.
 */
export function login(username, password) {
  const key = (username || "").toLowerCase().trim();
  const account = ACCOUNTS[key];
  if (!account) return null;

  const hash = process.env[account.env];
  if (!hash) {
    console.error(`Connexion refusée pour "${key}" : ${account.env} absent des variables d'environnement.`);
    return null;
  }
  if (!bcrypt.compareSync(password || "", hash)) return null;

  const payload = {
    sub: key,
    role: account.role,
    name: account.name,
    store: account.store || null,
    tutorOf: account.tutorOf || null,
    storeDataFrom: account.storeDataFrom || null,
  };
  return { token: jwt.sign(payload, SECRET, { expiresIn: "12h" }), user: payload };
}

// Middleware Express : vérifie le jeton et attache req.user
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Jeton manquant" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Jeton invalide ou expiré" });
  }
}

/**
 * Un compte alternant ne voit les données commerciales du magasin qu'à partir
 * de son entrée dans le GOAT. Avant, il n'a accès qu'à l'écran Alternance.
 * À poser sur /api/results, /api/goat, /api/vendors, /api/history, /api/visits,
 * /api/actions et /api/atm.
 */
export function requireStoreData(req, res, next) {
  if (req.user.role !== "apprentice") return next();
  const from = req.user.storeDataFrom;
  if (from && new Date().toISOString().slice(0, 10) >= from) return next();
  return res.status(403).json({
    error: "Cet écran n'est pas encore accessible depuis votre compte.",
  });
}

// Filtre les données pour ne renvoyer au magasin que ses propres chiffres
export function filterForUser(data, user) {
  if (user.role === "rz") return data;
  const store = user.store;
  const pick = (obj) => (obj && obj[store] ? { [store]: obj[store] } : {});
  const pickAnalysis = (obj) => (obj && obj[store] ? { [store]: obj[store] } : {});
  return {
    period: data.period,
    // La synthèse RZ contient des commentaires sur toute la zone. Les comptes
    // magasin disposent déjà de leurs analyses dédiées ci-dessous.
    syntheseRZ: "",
    faitsMarquants: [],
    updated: data.updated,
    workdays: data.workdays,
    page1: {
      accessoires: pick(data.page1.accessoires),
      gp: pick(data.page1.gp),
      occasion: pick(data.page1.occasion),
      analysis: {
        accessoires: pickAnalysis(data.page1.analysis?.accessoires),
        gp: pickAnalysis(data.page1.analysis?.gp),
      },
    },
    page2: {
      mobileo: pick(data.page2.mobileo),
      atm: pick(data.page2.atm),
      analysis: {
        mobileo: pickAnalysis(data.page2.analysis?.mobileo),
        atm: pickAnalysis(data.page2.analysis?.atm),
      },
    },
  };
}
