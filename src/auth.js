// ─── auth.js ─────────────────────────────────────────────────────────────────
// Connexion + jetons JWT. Le mot de passe sert à différencier RZ et magasins.
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Comptes. En production, déplacez ceci en base de données et hachez les mots de passe.
export const USERS = {
  "thomas.desternes": { role: "rz", name: "Thomas Desternes", password: "rz2024" },
  "dijon":      { role: "store", store: "Dijon",            name: "Dijon",            password: "dijon2024" },
  "lons":       { role: "store", store: "Lons-le-Saunier",  name: "Lons-le-Saunier",  password: "lons2024" },
  "pontarlier": { role: "store", store: "Pontarlier",       name: "Pontarlier",       password: "pont2024" },
  "chalon":     { role: "store", store: "Chalon-sur-Saône", name: "Chalon-sur-Saône", password: "chalon2024" },
  "besancon":   { role: "store", store: "Besançon",         name: "Besançon",         password: "bsn2024" },
};

export function login(username, password) {
  const key = (username || "").toLowerCase().trim();
  const user = USERS[key];
  if (!user || user.password !== password) return null;
  const payload = { sub: key, role: user.role, name: user.name, store: user.store || null };
  const token = jwt.sign(payload, SECRET, { expiresIn: "12h" });
  return { token, user: payload };
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

// Filtre les données pour ne renvoyer au magasin que ses propres chiffres
export function filterForUser(data, user) {
  if (user.role === "rz") return data;
  const store = user.store;
  const pick = (obj) => (obj && obj[store] ? { [store]: obj[store] } : {});
  const pickAnalysis = (obj) => (obj && obj[store] ? { [store]: obj[store] } : {});
  return {
    period: data.period,
    updated: data.updated,
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
