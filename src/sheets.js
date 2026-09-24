// ─── sheets.js ────────────────────────────────────────────────────────────────
// Remplace notion.js pour les résultats (Pages 1/2), le GOAT, les vendeurs,
// l'historique mensuel, les plans d'action et la bibliothèque process.
// Lecture seule : authentification par compte de service Google (JWT).
// Visites, ATM (dossiers) et Alternance restent sur Notion (notion.js / atm.js / alternance.js).
import { google } from "googleapis";
import fs from "fs";

const STORES = ["Pontarlier", "Lons-le-Saunier", "Dijon", "Besançon", "Chalon-sur-Saône"];
const OCC_OBJ = { "Pontarlier": 50, "Lons-le-Saunier": 50, "Dijon": 25, "Besançon": 20, "Chalon-sur-Saône": 15 };

// ─── Client Sheets (compte de service) ──────────────────────────────────────
let _sheets = null;

// Identifiants du compte de service, avec deux sources possibles :
//  1) Un fichier de clé JSON complet ("Secret File" Render, ou chemin fourni
//     via GOOGLE_SERVICE_ACCOUNT_KEY_FILE). C'est la méthode recommandée :
//     on colle le fichier .json tel quel, sans risque de corruption lors
//     d'un copier-coller partiel dans une variable d'environnement.
//  2) À défaut, les deux variables d'environnement séparées (ancien
//     fonctionnement) : GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.
function loadServiceAccountCredentials() {
const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || "/etc/secrets/google-service-account.json";
try {
if (fs.existsSync(keyFilePath)) {
const json = JSON.parse(fs.readFileSync(keyFilePath, "utf8"));
if (json.client_email && json.private_key) {
return { email: json.client_email, key: json.private_key, source: `fichier ${keyFilePath}` };
}
}
} catch (e) {
console.warn(`⚠️ Lecture du fichier de clé de service (${keyFilePath}) impossible : ${e.message}`);
}

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
// Render (et la plupart des plateformes) stockent les retours à la ligne
// d'une clé PEM comme "\n" littéral dans la variable d'env : on les restitue.
const key = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
return { email, key, source: "variables d'environnement" };
}

function sheetsClient() {
if (_sheets) return _sheets;
const { email, key, source } = loadServiceAccountCredentials();
if (!email || !key) throw new Error("Identifiants du compte de service Google introuvables (ni fichier de clé, ni variables d'environnement GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)");
console.log(`🔑 Compte de service Google chargé depuis : ${source}`);
const auth = new google.auth.JWT(email, null, key, ["https://www.googleapis.com/auth/spreadsheets.readonly"]);
_sheets = google.sheets({ version: "v4", auth });
return _sheets;
}

// Lit une plage de cellules, valeurs brutes (nombres en JS number, pas de mise en forme).
export async function readRange(spreadsheetId, range) {
if (!spreadsheetId) return [];
const sheets = sheetsClient();
const res = await sheets.spreadsheets.values.get({
spreadsheetId,
range,
valueRenderOption: "UNFORMATTED_VALUE",
});
return res.data.values || [];
}

// ─── Helpers communs (repris de notion.js) ──────────────────────────────────
const matchStore = (text) => {
const t = String(text || "").toLowerCase();
if (t.includes("chalon")) return "Chalon-sur-Saône";
if (t.includes("dijon")) return "Dijon";
if (t.includes("pontarlier")) return "Pontarlier";
if (t.includes("lons")) return "Lons-le-Saunier";
if (t.includes("besan")) return "Besançon";
return null;
};

// Les cellules numériques reviennent déjà en number (UNFORMATTED_VALUE) ; on
// gère aussi le cas texte ("20,1 %", "1 234 €") par sécurité.
const parseNum = (v) => {
if (v === null || v === undefined || v === "") return null;
if (typeof v === "number") return v;
const cleaned = String(v).replace(/\s|€|%|\*/g, "").replace(",", ".").trim();
const n = parseFloat(cleaned);
return isNaN(n) ? null : n;
};

const str = (v) => (v === null || v === undefined ? "" : String(v).trim());

const emojiStatus = (cell) => {
const t = str(cell);
if (t.includes("✅")) return "ok";
if (t.includes("⚠")) return "warn";
if (t.includes("🔴")) return "bad";
return null;
};

const isOui = (cell) => str(cell).toLowerCase() === "oui";

const isBlankRow = (row) => !row || row.length === 0 || row.every(c => str(c) === "");

// Convertit une date de cellule Google Sheets en chaîne ISO "AAAA-MM-JJ".
// Sheets renvoie un numéro de série (nombre de jours depuis le 30/12/1899)
// pour les cellules reconnues comme Date, mais du texte brut pour les lignes
// saisies directement en texte ("2026-09-08"). Sans cette conversion, les
// comparaisons/tris par date (ISO, alphabétiques) utilisés ailleurs dans ce
// fichier deviennent faux dès qu'une cellule Date est mélangée à du texte.
const sheetDate = (v) => {
if (v === null || v === undefined || v === "") return "";
const serialToISO = (n) => new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
if (typeof v === "number") return serialToISO(v);
const s = String(v).trim();
if (/^\d{4,6}$/.test(s)) return serialToISO(Number(s));
return s;
};

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin",
"juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Libellé de période (colonne "Période" du classeur GOAT) — protège contre le
// bug récurrent des "dates déguisées" : sur ce classeur en locale française,
// une cellule texte tapée comme une date (ex. "01.08.2026" pour "Août 2026")
// est silencieusement réinterprétée par Sheets et stockée comme un numéro de
// série (ex. 46235) au lieu du texte voulu. Plutôt que d'afficher ce numéro
// brut au responsable de zone, on le reconvertit en libellé de mois lisible.
// cf. section "Bug systémique — dates déguisées" du suivi projet.
function periodLabelFromCell(raw) {
const s = str(raw);
if (typeof raw === "number" || /^\d{4,6}$/.test(s)) {
const iso = sheetDate(raw);
const [y, m] = (iso || "").split("-").map(Number);
if (y && m >= 1 && m <= 12) {
const mois = MOIS_FR[m - 1];
return `${mois.charAt(0).toUpperCase()}${mois.slice(1)} ${y}`;
}
}
return s;
}

// Index des colonnes d'après une ligne d'en-tête (correspondance exacte, espaces ignorés).
function headerIndex(header) {
const map = {};
(header || []).forEach((h, i) => { map[str(h)] = i; });
return (name) => (name in map ? map[name] : -1);
}

// ─── MAGASINS : résultats mensuels (remplace Page1_Ratios + Page2_Mobileo_ATM) ──
// Feuille dédiée "Magasins_2026" (fichier séparé, comme Historique/GOAT/Process/
// Actions — plus de mélange dans le classeur "Pilotage_SAVE_Donnees").
// Structure volontairement plate, une seule table, une seule ligne d'en-tête :
//   L1 titre libre, L2 "Période : ... — Cumul au JJ/MM/AAAA (N jour ouvré du
//   mois sur M)", L3 vide, L4 en-têtes (noms exacts ci-dessous), L5+ une ligne
//   par magasin + une ligne "ZONE" (agrégat zone, exclue des dictionnaires par
//   magasin mais utilisée pour la synthèse RZ).
//
// Pourquoi une seule table plutôt que les anciens blocs Page1/Page2 : les trois
// bugs de septembre 2026 venaient tous d'un repère textuel devenu invisible
// (cellule d'en-tête vidée, marqueur de bloc manquant) sans que l'API ne
// remonte la moindre erreur — elle renvoyait 200 avec une structure vide.
// Ici, un seul jeu d'en-têtes à vérifier, et surtout : si un en-tête attendu
// est absent, on lève une erreur explicite (voir requireHeaderIndex) au lieu
// de continuer silencieusement avec des colonnes à -1. Le err remonte tel
// quel jusqu'à /api/results (502 + message), au lieu d'un 200 vide.
const MAGASINS_HEADER_ROW = 3;       // ligne 4 du tableur (index 0 = ligne 1)
const MAGASINS_DATA_START = 4;       // ligne 5 du tableur

const MAGASINS_COLUMNS = [
  "Magasin", "Marge Totale (€)", "Marge Accessoires (€)", "Ratio Accessoires (%)",
  "Ratio Accessoires J-1 (%)", "Marge GP (€)", "Ratio GP (%)", "Ratio GP J-1 (%)",
  "Occasion Volume", "Occasion Volume J-1", "Occasion Marge (€)", "Occasion Objectif",
  "Mobileo Détail", "Mobileo Total", "Mobileo Total J-1", "Mobileo Objectif",
  "ATM vendus", "ATM vendus J-1", "ATM Occasions", "ATM Ratio (%)", "ATM Ratio J-1 (%)",
  "Commentaire Accessoires", "Commentaire GP", "Commentaire Mobileo", "Commentaire ATM",
];

// Construit un accesseur de colonnes et vérifie que toutes les colonnes
// attendues sont bien présentes dans la ligne d'en-tête. Contrairement à
// headerIndex() seul (qui renvoie silencieusement -1 pour un nom absent),
// ceci lève une erreur nommant précisément la ou les colonnes manquantes —
// c'est le correctif direct des bugs des 16/17 septembre (colonne "Magasin"
// vide en L4, jamais signalée).
function requireHeaderIndex(header, expectedColumns, sourceLabel) {
  const idx = headerIndex(header);
  const missing = expectedColumns.filter((name) => idx(name) === -1);
  if (missing.length) {
    throw new Error(
      `${sourceLabel} : en-tête(s) manquant(s) ou vide(s) en ligne ${MAGASINS_HEADER_ROW + 1} — ` +
      `${missing.map((m) => `"${m}"`).join(", ")}. Vérifier la ligne d'en-tête du fichier avant de relire.`
    );
  }
  return idx;
}

function parsePeriodLine(line) {
  const m = String(line || "").match(
    /Période\s*:\s*([^—]+?)\s*—\s*Cumul au\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*\((\d+)[^\d]+sur\s*(\d+)\)/i
  );
  if (!m) return { period: "", updated: "", workdays: null };
  return {
    period: m[1].trim(),
    updated: m[2],
    workdays: { elapsed: Number(m[3]), total: Number(m[4]) },
  };
}

// Parse "Nom N, Nom N" (ou "—" / vide) en { Nom: N, ... }.
function parseVendorDetail(text) {
  const out = {};
  const t = str(text);
  if (!t || t === "—") return out;
  t.split(",").forEach((part) => {
    const m = part.trim().match(/^(.+?)\s+(\d+)$/);
    if (m) out[m[1].trim()] = Number(m[2]);
  });
  return out;
}

export function buildMagasinsFromRows(rows) {
  if (!rows.length) {
    throw new Error("Feuille Magasins vide ou illisible (0 ligne renvoyée par l'API Sheets).");
  }
  const header = rows[MAGASINS_HEADER_ROW] || [];
  const idx = requireHeaderIndex(header, MAGASINS_COLUMNS, "Feuille Magasins");

  const iMag = idx("Magasin"),
    iMargeTotale = idx("Marge Totale (€)"),
    iMargeAcc = idx("Marge Accessoires (€)"),
    iRatioAcc = idx("Ratio Accessoires (%)"), iRatioAccJ1 = idx("Ratio Accessoires J-1 (%)"),
    iMargeGP = idx("Marge GP (€)"),
    iRatioGP = idx("Ratio GP (%)"), iRatioGPJ1 = idx("Ratio GP J-1 (%)"),
    iOccVol = idx("Occasion Volume"), iOccVolJ1 = idx("Occasion Volume J-1"),
    iOccMarge = idx("Occasion Marge (€)"), iOccObj = idx("Occasion Objectif"),
    iMobDetail = idx("Mobileo Détail"), iMobTotal = idx("Mobileo Total"),
    iMobTotalJ1 = idx("Mobileo Total J-1"), iMobObj = idx("Mobileo Objectif"),
    iAtm = idx("ATM vendus"), iAtmJ1 = idx("ATM vendus J-1"),
    iAtmOcc = idx("ATM Occasions"), iAtmRatio = idx("ATM Ratio (%)"), iAtmRatioJ1 = idx("ATM Ratio J-1 (%)"),
    iComAcc = idx("Commentaire Accessoires"), iComGP = idx("Commentaire GP"),
    iComMob = idx("Commentaire Mobileo"), iComAtm = idx("Commentaire ATM");

  const accessoires = {}, gp = {}, occasion = {};
  const mobileo = {}, atm = {};
  const analysis1 = { accessoires: {}, gp: {} };
  const analysis2 = { mobileo: {}, atm: {} };
  let zoneComment = { acc: "", gp: "", mobileo: "", atm: "" };

  for (let r = MAGASINS_DATA_START; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) continue;
    const label = str(row[iMag]);
    const store = matchStore(label);

    if (!store) {
      if (label.toUpperCase() === "ZONE") {
        zoneComment = {
          acc: str(row[iComAcc]), gp: str(row[iComGP]),
          mobileo: str(row[iComMob]), atm: str(row[iComAtm]),
        };
      }
      continue;
    }

    const ratioAcc = parseNum(row[iRatioAcc]);
    const ratioAccJ1 = parseNum(row[iRatioAccJ1]);
    const margeTotale = parseNum(row[iMargeTotale]);
    accessoires[store] = {
      margeAcc: parseNum(row[iMargeAcc]),
      margeTotal: margeTotale,
      ratio: ratioAcc,
      trend: (ratioAcc != null && ratioAccJ1 != null) ? +(ratioAcc - ratioAccJ1).toFixed(1) : 0,
      status: ratioAcc != null && ratioAcc >= 25 ? "ok" : ratioAcc != null && ratioAcc >= 21.25 ? "warn" : "bad",
    };

    const ratioGP = parseNum(row[iRatioGP]);
    const ratioGPJ1 = parseNum(row[iRatioGPJ1]);
    gp[store] = {
      margeGP: parseNum(row[iMargeGP]),
      margeTotal: margeTotale,
      ratio: ratioGP,
      trend: (ratioGP != null && ratioGPJ1 != null) ? +(ratioGP - ratioGPJ1).toFixed(1) : 0,
      status: ratioGP != null && ratioGP >= 20 ? "ok" : ratioGP != null && ratioGP >= 17 ? "warn" : "bad",
    };

    const occVol = parseNum(row[iOccVol]);
    const occVolJ1 = parseNum(row[iOccVolJ1]);
    occasion[store] = {
      volume: occVol,
      marge: parseNum(row[iOccMarge]),
      objectif: parseNum(row[iOccObj]) || OCC_OBJ[store],
      trend: (occVol != null && occVolJ1 != null) ? +(occVol - occVolJ1).toFixed(1) : 0,
    };

    const mobTotal = parseNum(row[iMobTotal]) ?? 0;
    const mobTotalJ1 = parseNum(row[iMobTotalJ1]);
    mobileo[store] = {
      vendeurs: parseVendorDetail(row[iMobDetail]),
      total: mobTotal,
      objectif: str(row[iMobObj]) || "10-15",
      trend: mobTotalJ1 != null ? +(mobTotal - mobTotalJ1).toFixed(1) : 0,
      status: mobTotal >= 10 ? "ok" : mobTotal > 0 ? "warn" : "bad",
    };

    const atmRatio = parseNum(row[iAtmRatio]);
    const atmRatioJ1 = parseNum(row[iAtmRatioJ1]);
    atm[store] = {
      total: parseNum(row[iAtm]) ?? 0,
      mobOcc: parseNum(row[iAtmOcc]) ?? occVol ?? 0,
      ratio: atmRatio ?? 0,
      trend: (atmRatio != null && atmRatioJ1 != null) ? +(atmRatio - atmRatioJ1).toFixed(1) : 0,
      status: atmRatio != null && atmRatio >= 10 ? "ok" : "bad",
    };

    if (str(row[iComAcc])) analysis1.accessoires[store] = str(row[iComAcc]);
    if (str(row[iComGP])) analysis1.gp[store] = str(row[iComGP]);
    if (str(row[iComMob])) analysis2.mobileo[store] = str(row[iComMob]);
    if (str(row[iComAtm])) analysis2.atm[store] = str(row[iComAtm]);
  }

  return {
    page1: { accessoires, gp, occasion, analysis: analysis1 },
    page2: { mobileo, atm, analysis: analysis2 },
    zoneComment,
  };
}

// ─── API publique : résultats magasins ──────────────────────────────────────
export async function fetchResultsData() {
  const id = process.env.GOOGLE_SHEET_MAGASINS_ID;
  if (!id) throw new Error("GOOGLE_SHEET_MAGASINS_ID absent des variables d'environnement");

  const rows = await readRange(id, "A1:Z50");
  const meta = parsePeriodLine(rows[1] && rows[1][0]);
  const { page1, page2, zoneComment } = buildMagasinsFromRows(rows);

  // Pas de section "fait marquant" dédiée dans la feuille : on reconstitue la
  // synthèse RZ à partir des commentaires de la ligne ZONE.
  const syntheseRZ = [zoneComment.acc, zoneComment.gp, zoneComment.mobileo, zoneComment.atm]
    .filter(Boolean).join(" ");

  return {
    period: meta.period || "Mois en cours",
    updated: meta.updated || new Date().toLocaleDateString("fr-FR"),
    workdays: meta.workdays,
    syntheseRZ,
    faitsMarquants: syntheseRZ ? [syntheseRZ] : [],
    page1,
    page2,
  };
}

// ─── GOAT + cumul vendeurs (source unique : Pilotage_SAVE_GOAT) ────────────
// Colonnes : Date | Type période | Période | Vendeur | Magasin | Marge Totale (€) |
// Marge Accessoires (€) | Marge GP (€) | Ratio Accessoires (%) | Ratio GP (%) |
// Contrats Mobileo | ATM vendus | Ratio ATM (%) | Prime ATM historique (€) |
// Occasion vendus | Solo | Objectif Mobileo individuel | Score Accessoires |
// Score GP | Score Mobileo | Score ATM (calculé) | Score brut | Score final |
// MVP attribué | Note
function parseGoatRows(rows) {
if (!rows.length) return [];
const idx = headerIndex(rows[0]);
const iDate = idx("Date"), iType = idx("Type période"), iPeriode = idx("Période"),
iVendeur = idx("Vendeur"), iMagasin = idx("Magasin"),
iMargeTotale = idx("Marge Totale (€)"), iMargeAcc = idx("Marge Accessoires (€)"),
iMargeGP = idx("Marge GP (€)"), iRatioAcc = idx("Ratio Accessoires (%)"),
iRatioGP = idx("Ratio GP (%)"), iMobileo = idx("Contrats Mobileo"),
iAtmVendus = idx("ATM vendus"), iOccasion = idx("Occasion vendus"),
iSolo = idx("Solo"), iScoreAcc = idx("Score Accessoires"), iScoreGP = idx("Score GP"),
iScoreMobileo = idx("Score Mobileo"), iScoreAtm = idx("Score ATM (calculé)"),
iScoreFinal = idx("Score final"), iMvp = idx("MVP attribué");

return rows.slice(1).filter(r => !isBlankRow(r)).map(r => ({
date: sheetDate(r[iDate]),
periodType: str(r[iType]), // "Jour" | "Semaine" | "Mois"
periodLabel: periodLabelFromCell(r[iPeriode]),
name: str(r[iVendeur]),
store: str(r[iMagasin]),
margeTotale: parseNum(r[iMargeTotale]),
margeAccessoires: parseNum(r[iMargeAcc]),
margeGP: parseNum(r[iMargeGP]),
ratioAccessoires: parseNum(r[iRatioAcc]),
ratioGP: parseNum(r[iRatioGP]),
mobileo: parseNum(r[iMobileo]) ?? 0,
atm: parseNum(r[iAtmVendus]) ?? 0,
occasion: parseNum(r[iOccasion]) ?? 0,
isSolo: isOui(r[iSolo]),
mvp: isOui(r[iMvp]),
total: parseNum(r[iScoreFinal]) ?? 0,
breakdown: {
accessoires: parseNum(r[iScoreAcc]) ?? 0,
gp: parseNum(r[iScoreGP]) ?? 0,
mobileo: parseNum(r[iScoreMobileo]) ?? 0,
atm: parseNum(r[iScoreAtm]) ?? 0,
},
})).filter(r => r.name && r.periodType);
}

function groupGoatByPeriod(rows) {
const byLabel = {};
for (const r of rows) {
if (!r.periodLabel) continue;
if (!byLabel[r.periodLabel]) byLabel[r.periodLabel] = { label: r.periodLabel, start: r.date, scores: [] };
byLabel[r.periodLabel].scores.push({
name: r.name, store: r.store, total: r.total, isSolo: r.isSolo, breakdown: r.breakdown,
});
}
return Object.values(byLabel).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
}

function buildGoatData(rows) {
const weeklyRows = rows.filter(r => r.periodType === "Semaine");
const monthlyRows = rows.filter(r => r.periodType === "Mois");

const weeklyPeriods = groupGoatByPeriod(weeklyRows);
const monthlyPeriods = groupGoatByPeriod(monthlyRows);

const weekly = weeklyPeriods[0]
? { label: weeklyPeriods[0].label, scores: weeklyPeriods[0].scores.sort((a, b) => b.total - a.total) }
: null;
const monthly = monthlyPeriods[0]
? { label: monthlyPeriods[0].label, scores: monthlyPeriods[0].scores.sort((a, b) => b.total - a.total) }
: null;

const titlesHistory = rows
.filter(r => r.mvp)
.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
.map(r => ({
type: r.periodType === "Semaine" ? "week" : "month",
label: r.periodLabel,
winner: r.name,
store: r.store,
score: r.total,
start: r.date || "",
}));

return { weekly, monthly, titlesHistory };
}

const VENDOR_ROLES = {
"Mathis": "Responsable", "Narcisse": "Technicien",
"Jérôme": "Responsable", "Nassim": "Technicien",
"Jules": "Responsable", "Bilhal": "Technicien",
"Jean-Baptiste": "Seul en magasin", "Samy": "Seul en magasin",
};

// Nombre de vendeurs actifs par magasin (cf. effectif-zone-2026.md) — sert à
// répartir les objectifs magasin en objectifs individuels (50/50 responsable
// technicien, ou 100 % si seul en magasin). Loan exclu (parti le 11/06/2026).
const STORE_ACTIVE_COUNT = {
"Pontarlier": 2, "Lons-le-Saunier": 2, "Dijon": 2, "Chalon-sur-Saône": 1, "Besançon": 1,
};

// Objectif Mobileo individuel = 12 contrats ÷ nb vendeurs actifs du magasin
// (même règle que le scoring GOAT, cf. methode-goat.md).
const MOBILEO_OBJ_MAGASIN = 12;

function moisCourantISO(ref = new Date()) {
const y = ref.getFullYear(), m = String(ref.getMonth() + 1).padStart(2, "0");
return { debut: `${y}-${m}-01`, cle: `${y}-${m}` };
}

function buildVendorsMTD(rows) {
const { debut, cle } = moisCourantISO();
const agg = {};

for (const r of rows) {
if (r.periodType !== "Jour") continue;
if (!r.date || r.date < debut) continue;
const k = `${r.store}::${r.name}`;
if (!agg[k]) {
agg[k] = {
name: r.name, store: r.store, role: VENDOR_ROLES[r.name] || "",
margeTotale: 0, margeAccessoires: 0, margeGP: 0,
mobileo: 0, atm: 0, occasion: 0, jours: 0, dernierJour: "",
};
}
const a = agg[k];
const marge = r.margeTotale || 0;
a.margeTotale += marge;
a.margeAccessoires += r.margeAccessoires || 0;
a.margeGP += r.margeGP || 0;
a.mobileo += r.mobileo || 0;
a.atm += r.atm || 0;
a.occasion += r.occasion || 0;
if (marge > 0) a.jours += 1;
if (r.date > a.dernierJour) a.dernierJour = r.date;
}

const vendors = Object.values(agg).map(v => {
const activeCount = STORE_ACTIVE_COUNT[v.store] || 1;
return {
...v,
margeTotale: Math.round(v.margeTotale),
margeAccessoires: Math.round(v.margeAccessoires),
margeGP: Math.round(v.margeGP),
ratioAccessoires: v.margeTotale > 0 ? +((v.margeAccessoires / v.margeTotale) * 100).toFixed(1) : null,
ratioGP: v.margeTotale > 0 ? +((v.margeGP / v.margeTotale) * 100).toFixed(1) : null,
ratioATM: v.occasion > 0 ? +((v.atm / v.occasion) * 100).toFixed(1) : null,
// Objectifs individuels — cf. demande initiale de Thomas (répartition 50/50
// responsable/technicien, 100 % si seul en magasin) et methode-goat.md pour
// le Mobileo. Accessoires/GP restent le même seuil que le magasin (25 %/20 %),
// un ratio ne se "partage" pas entre deux vendeurs.
objectifAccessoires: 25,
objectifGP: 20,
objectifOccasion: +((OCC_OBJ[v.store] || 0) / activeCount).toFixed(1),
objectifMobileo: +(MOBILEO_OBJ_MAGASIN / activeCount).toFixed(1),
objectifATM: +(v.occasion * 0.10).toFixed(1),
};
}).sort((a, b) => b.margeTotale - a.margeTotale);

return { periode: cle, vendors };
}

async function readGoatRows() {
const id = process.env.GOOGLE_SHEET_GOAT_ID;
if (!id) return [];
const raw = await readRange(id, "A1:X5000");
return parseGoatRows(raw);
}

export async function fetchGoatData() {
const rows = await readGoatRows();
if (!rows.length) return { weekly: null, monthly: null, titlesHistory: [] };
return buildGoatData(rows);
}

export async function fetchVendorsMTD() {
const rows = await readGoatRows();
if (!rows.length) return { periode: null, vendors: [] };
return buildVendorsMTD(rows);
}

// GOAT + vendeurs partagent la même feuille : on ne la lit qu'une fois.
export async function fetchGoatBundle() {
const rows = await readGoatRows();
if (!rows.length) {
return { goat: { weekly: null, monthly: null, titlesHistory: [] }, vendors: { periode: null, vendors: [] } };
}
return { goat: buildGoatData(rows), vendors: buildVendorsMTD(rows) };
}

// ─── Plans d'action magasins ─────────────────────────────────────────────────
// Feuille "Plans_Action" : Action | Magasin | Concerne | Indicateur | État |
// Échéance | Mois | Origine | Publié | Notes
export async function fetchActions() {
const id = process.env.GOOGLE_SHEET_ACTIONS_ID;
if (!id) return [];

const rows = await readRange(id, "A1:J1000");
if (!rows.length) return [];

const idx = headerIndex(rows[0]);
const iAction = idx("Action"), iMag = idx("Magasin"), iConcerne = idx("Concerne"),
iIndic = idx("Indicateur"), iEtat = idx("État"), iEcheance = idx("Échéance"),
iMois = idx("Mois"), iOrigine = idx("Origine"), iPublie = idx("Publié"), iNotes = idx("Notes");
const ORDRE = { "À faire": 0, "En cours": 1, "Fait": 2 };

return rows.slice(1)
.filter(r => !isBlankRow(r) && r[iAction] && r[iMag])
.map((r, i) => ({
id: `sheet-action-${i}`,
title: str(r[iAction]),
store: str(r[iMag]),
who: str(r[iConcerne]),
indicator: str(r[iIndic]),
state: str(r[iEtat]) || "À faire",
due: str(r[iEcheance]),
month: str(r[iMois]),
origin: str(r[iOrigine]),
published: isOui(r[iPublie]),
notes: str(r[iNotes]),
url: "",
}))
.sort((a, b) =>
(ORDRE[a.state] ?? 0) - (ORDRE[b.state] ?? 0) ||
(a.due || "9999").localeCompare(b.due || "9999"));
}

// ─── Bibliothèque des process ────────────────────────────────────────────────
// Feuille "Pilotage_SAVE_Process" : Process | Thème | État | Publié | Date MAJ |
// Lien Drive | Format | Pour qui | Remarque
// Exports supplémentaires utiles pour les tests unitaires (aucun appel réseau).
export const _internal = { parsePeriodLine, buildMagasinsFromRows, parseGoatRows, buildGoatData, buildVendorsMTD };

export async function fetchProcess() {
const id = process.env.GOOGLE_SHEET_PROCESS_ID;
if (!id) return [];

const rows = await readRange(id, "A1:I500");
if (!rows.length) return [];

// La feuille porte un titre + une ligne de note avant l'en-tête réel : on
// cherche la ligne dont la 1ère cellule vaut exactement "Process".
let h = 0;
while (h < rows.length && str(rows[h][0]) !== "Process") h++;
if (h >= rows.length) return [];

const idx = headerIndex(rows[h]);
const iTitle = idx("Process"), iTheme = idx("Thème"), iEtat = idx("État"),
iPublie = idx("Publié"), iDate = idx("Date MAJ"), iLien = idx("Lien Drive"),
iFormat = idx("Format"), iPourQui = idx("Pour qui"), iRemarque = idx("Remarque");

const ORDRE_THEME = {
"Réparation & atelier": 0,
"Occasion & reprise": 1,
"Brokers": 2,
"Ventes & partenaires": 3,
"SAV & administratif": 4,
};

return rows.slice(h + 1)
.filter(r => !isBlankRow(r) && r[iTitle])
.map((r, i) => ({
id: `sheet-process-${i}`,
title: str(r[iTitle]),
theme: str(r[iTheme]) || "Autres",
url: str(r[iLien]),
format: str(r[iFormat]) || "PDF",
updated: str(r[iDate]),
state: str(r[iEtat]),
audience: str(r[iPourQui]) || "Tous",
published: isOui(r[iPublie]),
note: str(r[iRemarque]),
notionUrl: "",
}))
.sort((a, b) =>
(ORDRE_THEME[a.theme] ?? 9) - (ORDRE_THEME[b.theme] ?? 9) ||
(b.updated || "").localeCompare(a.updated || "") ||
a.title.localeCompare(b.title, "fr"));
}
