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
async function readRange(spreadsheetId, range) {
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

// Index des colonnes d'après une ligne d'en-tête (correspondance exacte, espaces ignorés).
function headerIndex(header) {
const map = {};
(header || []).forEach((h, i) => { map[str(h)] = i; });
return (name) => (name in map ? map[name] : -1);
}

// ─── PAGE 1 : Ratios Accessoires / GP / Occasion ────────────────────────────
// Feuille "Page1_Ratios" (fichier dédié) :
// L1 titre, L2 "Période : ... — Cumul au JJ/MM/AAAA (N jour ouvré du mois sur M)",
// L3 vide, L4 en-têtes, L5+ une ligne par magasin + une ligne ZONE (agrégat,
// ignorée ici comme le ferait matchStore, exactement comme sur Notion avant).
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

function buildPage1FromRows(rows) {
const header = rows[3] || [];
const idx = headerIndex(header);
const iMagasin = idx("Magasin");
const iMargeAcc = idx("Marge Access. (€)");
const iMargeGP = idx("Marge GP (€)");
const iMargeTotale = idx("Marge Totale (€)");
const iRatioAcc = idx("Ratio Acc. (%)");
const iRatioAccJ1 = idx("Ratio Acc. J-1 (%)");
const iStatutAcc = idx("Statut Acc");
const iRatioGP = idx("Ratio GP (%)");
const iRatioGPJ1 = idx("Ratio GP J-1 (%)");
const iStatutGP = idx("Statut GP");
const iOccVol = idx("Occasion Volume");
const iOccVolJ1 = idx("Occasion Volume J-1");
const iOccMarge = idx("Occasion Marge (€)");
const iOccObj = idx("Occasion Objectif");
const iComAcc = idx("Commentaire Accessoires");
const iComGP = idx("Commentaire GP");

const accessoires = {}, gp = {}, occasion = {};
const analysis = { accessoires: {}, gp: {} };
let zoneComment = { acc: "", gp: "" };

for (let r = 4; r < rows.length; r++) {
const row = rows[r];
if (isBlankRow(row)) continue;
const label = row[iMagasin];
const store = matchStore(label);

if (!store) {
// Ligne ZONE (ou toute ligne non reconnue) : on garde ses commentaires
// pour la synthèse RZ, sans l'injecter dans les dictionnaires par magasin.
if (str(label).toUpperCase() === "ZONE") {
zoneComment = { acc: str(row[iComAcc]), gp: str(row[iComGP]) };
}
continue;
}

const ratioAcc = parseNum(row[iRatioAcc]);
const ratioAccJ1 = parseNum(row[iRatioAccJ1]);
accessoires[store] = {
margeAcc: parseNum(row[iMargeAcc]),
margeTotal: parseNum(row[iMargeTotale]),
ratio: ratioAcc,
trend: (ratioAcc != null && ratioAccJ1 != null) ? +(ratioAcc - ratioAccJ1).toFixed(1) : 0,
status: emojiStatus(row[iStatutAcc]) || "bad",
};

const ratioGP = parseNum(row[iRatioGP]);
const ratioGPJ1 = parseNum(row[iRatioGPJ1]);
gp[store] = {
margeGP: parseNum(row[iMargeGP]),
margeTotal: parseNum(row[iMargeTotale]),
ratio: ratioGP,
trend: (ratioGP != null && ratioGPJ1 != null) ? +(ratioGP - ratioGPJ1).toFixed(1) : 0,
status: emojiStatus(row[iStatutGP]) || "bad",
};

const occVol = parseNum(row[iOccVol]);
const occVolJ1 = parseNum(row[iOccVolJ1]);
occasion[store] = {
volume: occVol,
marge: parseNum(row[iOccMarge]),
objectif: parseNum(row[iOccObj]) || OCC_OBJ[store],
trend: (occVol != null && occVolJ1 != null) ? +(occVol - occVolJ1).toFixed(1) : 0,
};

if (str(row[iComAcc])) analysis.accessoires[store] = str(row[iComAcc]);
if (str(row[iComGP])) analysis.gp[store] = str(row[iComGP]);
}

return { accessoires, gp, occasion, analysis, zoneComment };
}

// ─── PAGE 2 : Mobileo / ATM ─────────────────────────────────────────────────
// Feuille "Page2_Mobileo_ATM" : deux blocs repérés par un marqueur en colonne A
// ("MOBILEO" puis "ATM (..."), chacun suivi d'une ligne d'en-tête "Magasin | ...".
function findMarkerRow(rows, predicate, from = 0) {
for (let r = from; r < rows.length; r++) {
if (predicate(str(rows[r] && rows[r][0]))) return r;
}
return -1;
}

function readSection(rows, fromIdx) {
let h = fromIdx;
while (h < rows.length && str(rows[h] && rows[h][0]) !== "Magasin") h++;
if (h >= rows.length) return { header: [], data: [] };
const header = rows[h];
const data = [];
for (let r = h + 1; r < rows.length; r++) {
if (isBlankRow(rows[r])) break;
data.push(rows[r]);
}
return { header, data };
}

function buildPage2FromRows(rows) {
const mobileo = {}, atm = {};
const analysis = { mobileo: {}, atm: {} };

const mobMarker = findMarkerRow(rows, c => c.toUpperCase() === "MOBILEO");
const { header: mobHeader, data: mobData } = mobMarker >= 0 ? readSection(rows, mobMarker + 1) : { header: [], data: [] };

if (mobHeader.length) {
const idx = headerIndex(mobHeader);
const iMag = idx("Magasin"), iVend = idx("Vendeur"), iContrats = idx("Contrats"),
iContratsJ1 = idx("Contrats J-1"), iEstTotal = idx("Est total ?"),
iStatut = idx("Statut"), iCom = idx("Commentaire");

for (const row of mobData) {
const store = matchStore(row[iMag]);
if (!store) continue; // ZONE ou ligne non reconnue : ignorée, comme les magasins sur Notion
if (!mobileo[store]) mobileo[store] = { vendeurs: {}, total: 0, objectif: "10-15", trend: 0, status: null };

const contrats = parseNum(row[iContrats]) ?? 0;
const contratsJ1 = parseNum(row[iContratsJ1]);

if (isOui(row[iEstTotal])) {
mobileo[store].total = contrats;
mobileo[store].trend = contratsJ1 != null ? +(contrats - contratsJ1).toFixed(1) : 0;
mobileo[store].status = emojiStatus(row[iStatut]) || "bad";
if (str(row[iCom])) analysis.mobileo[store] = str(row[iCom]);
} else {
const vendeur = str(row[iVend]);
if (vendeur) mobileo[store].vendeurs[vendeur] = contrats;
}
}
// Sécurité : si jamais une ligne TOTAL manque, on retombe sur la somme des vendeurs.
for (const store of Object.keys(mobileo)) {
const sum = Object.values(mobileo[store].vendeurs).reduce((a, b) => a + (b || 0), 0);
if (!mobileo[store].total && sum) mobileo[store].total = sum;
}
}

const atmMarker = findMarkerRow(rows, c => c.toUpperCase().startsWith("ATM ("));
const { header: atmHeader, data: atmData } = atmMarker >= 0 ? readSection(rows, atmMarker + 1) : { header: [], data: [] };

if (atmHeader.length) {
const idx = headerIndex(atmHeader);
const iMag = idx("Magasin"), iAtm = idx("ATM vendus"), iAtmJ1 = idx("ATM J-1"),
iOcc = idx("Occasions"), iRatio = idx("Ratio (%)"), iRatioJ1 = idx("Ratio J-1 (%)"),
iStatut = idx("Statut"), iCom = idx("Commentaire");

for (const row of atmData) {
const store = matchStore(row[iMag]);
if (!store) continue; // ZONE ignorée
const ratio = parseNum(row[iRatio]);
const ratioJ1 = parseNum(row[iRatioJ1]);
atm[store] = {
total: parseNum(row[iAtm]) ?? 0,
mobOcc: parseNum(row[iOcc]) ?? 0,
ratio: ratio ?? 0,
trend: (ratio != null && ratioJ1 != null) ? +(ratio - ratioJ1).toFixed(1) : 0,
status: emojiStatus(row[iStatut]) || "bad",
};
if (str(row[iCom])) analysis.atm[store] = str(row[iCom]);
}
}

return { mobileo, atm, analysis };
}

// ─── API publique : résultats (Pages 1 + 2) ─────────────────────────────────
export async function fetchResultsData() {
const page1Id = process.env.GOOGLE_SHEET_MAIN_ID;
const page2Id = process.env.GOOGLE_SHEET_MAIN_ID;

const [rows1, rows2] = await Promise.all([
readRange(page1Id, "Page1_Ratios!A1:R300"),
readRange(page2Id, "Page2_Mobileo_ATM!A1:H300"),
]);

const meta = parsePeriodLine(rows1[1] && rows1[1][0]);
const { accessoires, gp, occasion, analysis: analysis1, zoneComment } = buildPage1FromRows(rows1);
const page2 = buildPage2FromRows(rows2);

// Pas de section "fait marquant" dédiée dans les nouvelles feuilles : on
// reconstitue la synthèse RZ à partir des commentaires de la ligne ZONE.
const syntheseRZ = [zoneComment.acc, zoneComment.gp].filter(Boolean).join(" ");

return {
period: meta.period || "Mois en cours",
updated: meta.updated || new Date().toLocaleDateString("fr-FR"),
workdays: meta.workdays,
syntheseRZ,
faitsMarquants: syntheseRZ ? [syntheseRZ] : [],
page1: { accessoires, gp, occasion, analysis: analysis1 },
page2,
};
}

// ─── Historique mensuel ──────────────────────────────────────────────────────
// Feuille "Historique_Mensuel" : une ligne = un magasin sur un mois donné.
export async function fetchHistory() {
const id = process.env.GOOGLE_SHEET_HISTORY_ID;
if (!id) return { months: [], byStore: {} };

const rows = await readRange(id, "A1:L3000");
if (!rows.length) return { months: [], byStore: {} };

const idx = headerIndex(rows[0]);
const iMois = idx("Mois"), iMag = idx("Magasin"), iAcc = idx("Ratio Accessoires (%)"),
iMargeAcc = idx("Marge Accessoires (€)"), iGP = idx("Ratio GP (%)"),
iMargeGP = idx("Marge GP (€)"), iOcc = idx("Mobiles Occasion"),
iObjOcc = idx("Objectif Occasion"), iMobileo = idx("Forfaits Mobileo"),
iAtm = idx("Ratio ATM (%)"), iMargeTotale = idx("Marge Totale (€)"),
iSynth = idx("Synthèse du mois");

const rowsData = rows.slice(1)
.filter(r => !isBlankRow(r) && r[iMois] && r[iMag])
.map(r => ({
mois: str(r[iMois]),
magasin: str(r[iMag]),
accessoires: parseNum(r[iAcc]),
margeAccessoires: parseNum(r[iMargeAcc]),
gp: parseNum(r[iGP]),
margeGP: parseNum(r[iMargeGP]),
occasion: parseNum(r[iOcc]),
objectifOccasion: parseNum(r[iObjOcc]),
mobileo: parseNum(r[iMobileo]),
atm: parseNum(r[iAtm]),
margeTotale: parseNum(r[iMargeTotale]),
synthese: str(r[iSynth]),
}));

const months = [...new Set(rowsData.map(r => r.mois))].sort();
const byStore = {};
for (const r of rowsData) {
if (!byStore[r.magasin]) byStore[r.magasin] = [];
byStore[r.magasin].push(r);
}
for (const s of Object.keys(byStore)) byStore[s].sort((a, b) => a.mois.localeCompare(b.mois));

return { months, byStore, rows: rowsData };
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
periodLabel: str(r[iPeriode]),
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

const vendors = Object.values(agg).map(v => ({
...v,
margeTotale: Math.round(v.margeTotale),
margeAccessoires: Math.round(v.margeAccessoires),
margeGP: Math.round(v.margeGP),
ratioAccessoires: v.margeTotale > 0 ? +((v.margeAccessoires / v.margeTotale) * 100).toFixed(1) : null,
ratioGP: v.margeTotale > 0 ? +((v.margeGP / v.margeTotale) * 100).toFixed(1) : null,
ratioATM: v.occasion > 0 ? +((v.atm / v.occasion) * 100).toFixed(1) : null,
})).sort((a, b) => b.margeTotale - a.margeTotale);

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
export const _internal = { parsePeriodLine, buildPage1FromRows, buildPage2FromRows, parseGoatRows, buildGoatData, buildVendorsMTD };

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
