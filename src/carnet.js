// ─── carnet.js ───────────────────────────────────────────────────────────────
// Carnet de réparations des techniciens en formation (famille « Formation »).
//
// Chaque réparation faite par un arrivant est enregistrée : marque, modèle,
// panne, méthode, autonomie, difficulté ressentie, temps passé, résultat du
// test. Le référent (compte magasin) commente et valide, le RZ voit tout.
// Une grille d'acquis se remplit à partir de ces lignes ; la validation finale
// d'un acquis reste une décision humaine (référent magasin ou RZ).
//
// Stockage : Google Sheet « Carnet_Reparations_SAVE » (GOOGLE_SHEET_CARNET_ID),
// deux onglets — « Interventions » et « Acquis ». Le module crée l'onglet
// Acquis et pose les en-têtes s'ils manquent.
//
// Écriture en valueInputOption RAW : Sheets ne réinterprète rien. C'est ce qui
// protège ce classeur du piège des « dates déguisées » de la locale française
// (« 14.9 » relu comme le 14 septembre) qui a touché GOAT et Magasins_2026.
// Les dates sont stockées en texte ISO (AAAA-MM-JJ).
import { google } from "googleapis";
import fs from "fs";
import { ACCOUNTS } from "./auth.js";

const SHEET_ID = () => process.env.GOOGLE_SHEET_CARNET_ID;
const TAB_INTER = "Interventions";
const TAB_ACQUIS = "Acquis";

export const COLS = [
  "ID", "Date", "Technicien", "Magasin", "Marque", "Modèle", "Catégorie",
  "Panne constatée", "Méthode de réparation", "Autonomie", "Difficulté (1-5)",
  "Temps (min)", "Test final", "À retenir", "Commentaire référent", "Validé par", "Date validation",
];
const COLS_ACQUIS = ["Technicien", "Acquis", "Statut", "Par", "Date", "Commentaire"];

// ─── Référentiel ────────────────────────────────────────────────────────────
export const MARQUES = ["Apple", "Samsung", "Xiaomi", "Oppo", "Honor", "Huawei", "Motorola", "Google", "OnePlus", "Realme", "Autre"];
export const CATEGORIES = [
  "Écran", "Batterie", "Vitre arrière", "Connecteur de charge", "Caméra",
  "Son (HP / micro)", "Boutons / nappes", "Désoxydation", "Diagnostic", "Logiciel", "Autre",
];
export const AUTONOMIE = [
  { id: "Observé", aide: "J'ai regardé Narcisse faire" },
  { id: "Guidé",   aide: "Je l'ai fait, avec de l'aide" },
  { id: "Seul",    aide: "Je l'ai fait seul, contrôle à la fin" },
];
export const TESTS = ["OK du 1er coup", "OK après reprise", "KO / non réparé"];

// Un acquis = une famille de réparation. `match` dit quelles lignes du carnet
// comptent pour lui. Seuil « prêt à valider » : au moins 3 réparations, et les
// 2 dernières faites seul avec un test OK du premier coup.
const android = (m) => m !== "Apple";
export const ACQUIS = [
  { id: "ecran-apple",     label: "Écran iPhone",                      cat: "Écran",               match: (r) => r.marque === "Apple" },
  { id: "ecran-samsung",   label: "Écran Samsung (à coller)",          cat: "Écran",               match: (r) => r.marque === "Samsung" },
  { id: "ecran-autres",    label: "Écran autres marques",              cat: "Écran",               match: (r) => r.marque !== "Apple" && r.marque !== "Samsung" },
  { id: "batterie-apple",  label: "Batterie iPhone",                   cat: "Batterie",            match: (r) => r.marque === "Apple" },
  { id: "batterie-android",label: "Batterie Android",                  cat: "Batterie",            match: (r) => android(r.marque) },
  { id: "vitre-apple",     label: "Vitre arrière iPhone",              cat: "Vitre arrière",       match: (r) => r.marque === "Apple" },
  { id: "vitre-android",   label: "Vitre arrière Android",             cat: "Vitre arrière",       match: (r) => android(r.marque) },
  { id: "connecteur",      label: "Connecteur de charge",              cat: "Connecteur de charge" },
  { id: "camera",          label: "Caméra / lentille",                 cat: "Caméra" },
  { id: "son",             label: "Haut-parleur / micro",              cat: "Son (HP / micro)" },
  { id: "boutons",         label: "Boutons / nappes",                  cat: "Boutons / nappes" },
  { id: "oxydation",       label: "Désoxydation",                      cat: "Désoxydation" },
  { id: "diagnostic",      label: "Diagnostic de panne",               cat: "Diagnostic" },
];
export const SEUIL = { min: 3, derniersSeulOk: 2 };

// ─── Apprenants ─────────────────────────────────────────────────────────────
// Lus dans les comptes : tout compte « trainee » (nouvel embauché) ou
// « apprentice » (alternant) a un carnet.
export function apprenants() {
  return Object.entries(ACCOUNTS)
    .filter(([, a]) => a.role === "trainee" || a.role === "apprentice")
    .map(([login, a]) => ({
      login, name: a.name, store: a.store, role: a.role,
      debut: a.debut || null, referent: a.referent || null, doublonJusquau: a.doublonJusquau || null,
      periode: a.periode || "Doublon",
    }))
    // Nouveaux embauchés et stagiaires d'abord, alternants ensuite.
    .sort((x, y) => (x.role === "trainee" ? 0 : 1) - (y.role === "trainee" ? 0 : 1));
}

// Qui voit le carnet de qui.
export function apprenantsVisibles(user) {
  const all = apprenants();
  if (user.role === "rz") return all;
  if (user.role === "trainee" || user.role === "apprentice") return all.filter(a => a.name === user.name);
  return all.filter(a => a.store === user.store);
}
const peutValider = (user, app) => user.role === "rz" || (user.role === "store" && user.store === app.store);

function refus(msg, status = 403) { const e = new Error(msg); e.status = status; return e; }

// ─── Client Sheets en écriture ──────────────────────────────────────────────
// sheets.js reste en lecture seule ; ce module a son propre client, avec le
// droit d'écriture, limité de fait au seul classeur du carnet.
let _client = null;
function client() {
  if (_client) return _client;
  let email, key;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || "/etc/secrets/google-service-account.json";
  try {
    if (fs.existsSync(keyFile)) {
      const j = JSON.parse(fs.readFileSync(keyFile, "utf8"));
      email = j.client_email; key = j.private_key;
    }
  } catch { /* repli sur les variables d'environnement */ }
  if (!email || !key) {
    email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
    key = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  }
  if (!email || !key) throw new Error("Compte de service Google introuvable");
  const auth = new google.auth.JWT(email, null, key, ["https://www.googleapis.com/auth/spreadsheets"]);
  _client = google.sheets({ version: "v4", auth });
  return _client;
}

// Pose la structure du classeur au premier appel : renomme le premier onglet
// en « Interventions », crée « Acquis », écrit les en-têtes manquants.
let _pret = false;
async function assurerStructure() {
  if (_pret) return;
  const id = SHEET_ID();
  if (!id) throw refus("Carnet non configuré (GOOGLE_SHEET_CARNET_ID absent sur Render).", 503);
  const s = client();
  const meta = await s.spreadsheets.get({ spreadsheetId: id, fields: "sheets.properties" });
  const onglets = meta.data.sheets.map(x => x.properties);
  const requests = [];
  if (!onglets.some(o => o.title === TAB_INTER)) {
    requests.push({ updateSheetProperties: { properties: { sheetId: onglets[0].sheetId, title: TAB_INTER }, fields: "title" } });
  }
  if (!onglets.some(o => o.title === TAB_ACQUIS)) {
    requests.push({ addSheet: { properties: { title: TAB_ACQUIS } } });
  }
  if (requests.length) await s.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests } });
  await s.spreadsheets.values.update({
    spreadsheetId: id, range: `${TAB_INTER}!A1`, valueInputOption: "RAW", requestBody: { values: [COLS] },
  });
  await s.spreadsheets.values.update({
    spreadsheetId: id, range: `${TAB_ACQUIS}!A1`, valueInputOption: "RAW", requestBody: { values: [COLS_ACQUIS] },
  });
  _pret = true;
}

async function lire(tab, cols) {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: SHEET_ID(), range: `${tab}!A1:${String.fromCharCode(64 + cols)}5000`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return res.data.values || [];
}

// ─── Conversion ligne ⇄ objet ──────────────────────────────────────────────
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(",", ".")));
export function ligneVersInter(row, index) {
  const g = (i) => (row[i] === undefined ? "" : row[i]);
  return {
    id: String(g(0)), ligne: index + 2, date: String(g(1)), technicien: String(g(2)), magasin: String(g(3)),
    marque: String(g(4)), modele: String(g(5)), categorie: String(g(6)), panne: String(g(7)),
    methode: String(g(8)), autonomie: String(g(9)), difficulte: num(g(10)), temps: num(g(11)),
    test: String(g(12)), aRetenir: String(g(13)), commentaire: String(g(14)),
    validePar: String(g(15)), dateValidation: String(g(16)),
  };
}
const interVersLigne = (r) => [
  r.id, r.date, r.technicien, r.magasin, r.marque, r.modele, r.categorie, r.panne, r.methode,
  r.autonomie, r.difficulte ?? "", r.temps ?? "", r.test, r.aRetenir, r.commentaire || "",
  r.validePar || "", r.dateValidation || "",
];

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const txt = (v, max = 1500) => String(v ?? "").trim().slice(0, max);

export function valider(body) {
  const r = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : today(),
    marque: txt(body.marque, 40), modele: txt(body.modele, 80), categorie: txt(body.categorie, 40),
    panne: txt(body.panne), methode: txt(body.methode, 3000), autonomie: txt(body.autonomie, 20),
    difficulte: num(body.difficulte), temps: num(body.temps), test: txt(body.test, 40), aRetenir: txt(body.aRetenir),
  };
  if (!r.marque) throw refus("Indique la marque.", 400);
  if (!r.modele) throw refus("Indique le modèle.", 400);
  if (!CATEGORIES.includes(r.categorie)) throw refus("Choisis une catégorie de panne.", 400);
  if (!AUTONOMIE.some(a => a.id === r.autonomie)) throw refus("Indique ton niveau d'autonomie.", 400);
  if (!(r.difficulte >= 1 && r.difficulte <= 5)) throw refus("Note la difficulté de 1 à 5.", 400);
  if (!(r.temps > 0 && r.temps <= 600)) throw refus("Indique le temps passé en minutes (entre 1 et 600).", 400);
  if (!TESTS.includes(r.test)) throw refus("Indique le résultat du test final.", 400);
  r.difficulte = Math.round(r.difficulte);
  r.temps = Math.round(r.temps);
  return r;
}

// ─── Calcul des acquis (pur, testable) ─────────────────────────────────────
export function etatAcquis(interventions, validations) {
  return ACQUIS.map(a => {
    const lignes = interventions
      .filter(r => r.categorie === a.cat && (!a.match || a.match(r)))
      .sort((x, y) => (x.date + x.id).localeCompare(y.date + y.id));
    const n = lignes.length;
    const seul = lignes.filter(r => r.autonomie === "Seul").length;
    const derniers = lignes.slice(-SEUIL.derniersSeulOk);
    const pret = n >= SEUIL.min && derniers.length === SEUIL.derniersSeulOk
      && derniers.every(r => r.autonomie === "Seul" && r.test === "OK du 1er coup");
    const v = validations[a.id];
    const tempsMoy = (arr) => arr.length ? Math.round(arr.reduce((s, r) => s + (r.temps || 0), 0) / arr.length) : null;
    const statut = v ? "Validé" : pret ? "Prêt à valider" : n ? "En cours" : "Pas commencé";
    return {
      id: a.id, label: a.label, categorie: a.cat, n, seul, statut,
      modeles: [...new Set(lignes.map(r => `${r.marque} ${r.modele}`))],
      tempsPremiers: tempsMoy(lignes.slice(0, 2)), tempsDerniers: n > 2 ? tempsMoy(lignes.slice(-2)) : null,
      validation: v || null,
    };
  });
}

// Validations : on ajoute une ligne à chaque décision ; la dernière fait foi.
function validationsDe(rowsAcquis, technicien) {
  const out = {};
  for (const row of rowsAcquis.slice(1)) {
    if (String(row[0]) !== technicien) continue;
    const id = String(row[1] || "");
    if (row[2] === "Validé") out[id] = { par: String(row[3] || ""), date: String(row[4] || ""), commentaire: String(row[5] || "") };
    else delete out[id];
  }
  return out;
}

// ─── API ────────────────────────────────────────────────────────────────────
function cible(user, nom) {
  const visibles = apprenantsVisibles(user);
  const app = nom ? visibles.find(a => a.name === nom) : visibles[0];
  if (!app) throw refus(nom ? "Ce carnet n'est pas accessible depuis ton compte." : "Aucun carnet de formation pour ce compte.", nom ? 403 : 404);
  return app;
}

export async function fetchCarnet(user, nom) {
  const visibles = apprenantsVisibles(user);
  const base = { apprenants: visibles, referentiel: { marques: MARQUES, categories: CATEGORIES, autonomie: AUTONOMIE, tests: TESTS, acquis: ACQUIS.map(({ id, label, cat }) => ({ id, label, categorie: cat })), seuil: SEUIL } };
  if (!visibles.length) return { ...base, apprenant: null, interventions: [], acquis: [], peutValider: false };
  const app = cible(user, nom);
  await assurerStructure();
  const [rows, rowsAcq] = await Promise.all([lire(TAB_INTER, COLS.length), lire(TAB_ACQUIS, COLS_ACQUIS.length)]);
  const interventions = rows.slice(1).map(ligneVersInter).filter(r => r.id && r.technicien === app.name);
  return {
    ...base, apprenant: app, interventions,
    acquis: etatAcquis(interventions, validationsDe(rowsAcq, app.name)),
    peutValider: peutValider(user, app),
  };
}

export async function createIntervention(user, body) {
  const app = cible(user, body.technicien || (user.role === "trainee" || user.role === "apprentice" ? user.name : null));
  const estLui = app.name === user.name;
  if (!estLui && !peutValider(user, app)) throw refus("Tu ne peux pas saisir dans ce carnet.");
  const r = valider(body);
  await assurerStructure();
  const ligne = {
    ...r, id: "R" + Date.now().toString(36).toUpperCase(), technicien: app.name, magasin: app.store,
    commentaire: estLui ? "" : txt(body.commentaire), validePar: "", dateValidation: "",
  };
  await client().spreadsheets.values.append({
    spreadsheetId: SHEET_ID(), range: `${TAB_INTER}!A1`, valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS", requestBody: { values: [interVersLigne(ligne)] },
  });
  return ligne;
}

export async function updateIntervention(user, id, body) {
  await assurerStructure();
  const rows = await lire(TAB_INTER, COLS.length);
  const idx = rows.findIndex((row, i) => i > 0 && String(row[0]) === id);
  if (idx < 1) throw refus("Réparation introuvable.", 404);
  const cur = ligneVersInter(rows[idx], idx - 1);
  const app = cible(user, cur.technicien);
  const estLui = app.name === user.name;
  let next = { ...cur };

  if (estLui) {
    if (cur.validePar) throw refus("Cette réparation a été validée par ton référent : elle ne se modifie plus.");
    next = { ...next, ...valider({ ...cur, ...body }) };
  } else if (peutValider(user, app)) {
    // Le référent commente et valide. Il ne réécrit pas la saisie de l'arrivant.
    if (body.commentaire !== undefined) next.commentaire = txt(body.commentaire);
    if (body.valide === true) { next.validePar = txt(body.par, 60) || user.name; next.dateValidation = today(); }
    if (body.valide === false) { next.validePar = ""; next.dateValidation = ""; }
  } else throw refus("Tu ne peux pas modifier ce carnet.");

  await client().spreadsheets.values.update({
    spreadsheetId: SHEET_ID(), range: `${TAB_INTER}!A${idx + 1}`, valueInputOption: "RAW",
    requestBody: { values: [interVersLigne(next)] },
  });
  return next;
}

export async function decisionAcquis(user, body) {
  const app = cible(user, body.technicien);
  if (!peutValider(user, app)) throw refus("La validation d'un acquis est réservée au référent du magasin et au RZ.");
  if (!ACQUIS.some(a => a.id === body.acquis)) throw refus("Acquis inconnu.", 400);
  await assurerStructure();
  await client().spreadsheets.values.append({
    spreadsheetId: SHEET_ID(), range: `${TAB_ACQUIS}!A1`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[app.name, body.acquis, body.valide === false ? "Retiré" : "Validé", txt(body.par, 60) || user.name, today(), txt(body.commentaire, 500)]] },
  });
  return { ok: true };
}
