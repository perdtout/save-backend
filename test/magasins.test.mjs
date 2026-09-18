// Test minimal, sans dépendance ni appel réseau — vérifie :
// 1) qu'un jeu de lignes correct produit bien les 5 magasins ;
// 2) que le bug du 16-17/09/2026 (cellule d'en-tête "Magasin" vidée par
//    erreur) est désormais détecté et lève une erreur explicite au lieu de
//    renvoyer silencieusement une structure vide.
// Lancer avec : npm test
import { buildMagasinsFromRows } from "../src/sheets.js";

const FIXTURE = [
  ["SAVE — Suivi mensuel Magasins (remplace Page1_Ratios + Page2_Mobileo_ATM)"],
  ["Période : Septembre 2026 — Cumul au 17/09/2026 (13e jour ouvré du mois sur 22)"],
  [],
  ["Magasin", "Marge Totale (€)", "Marge Accessoires (€)", "Ratio Accessoires (%)", "Ratio Accessoires J-1 (%)", "Marge GP (€)", "Ratio GP (%)", "Ratio GP J-1 (%)", "Occasion Volume", "Occasion Volume J-1", "Occasion Marge (€)", "Occasion Objectif", "Mobileo Détail", "Mobileo Total", "Mobileo Total J-1", "Mobileo Objectif", "ATM vendus", "ATM vendus J-1", "ATM Occasions", "ATM Ratio (%)", "ATM Ratio J-1 (%)", "Commentaire Accessoires", "Commentaire GP", "Commentaire Mobileo", "Commentaire ATM"],
  ["Pontarlier", 12923, 3880, 30.0, "", 3241, 25.1, "", 20, "", 1551, 50, "Mathis 2, Narcisse 2", 4, "", "10-15", 2, "", 20, 10.0, "", "Commentaire accessoires test", "Commentaire GP test", "Commentaire mobileo test", "Commentaire ATM test"],
  ["Dijon", 4935, 1409, 28.6, "", 858, 17.4, "", 10, "", 626, 25, "Jules 0, Bilhal 1", 1, "", "10-15", 1, "", 10, 10.0, "", "", "", "", ""],
  ["Chalon-sur-Saône", 3607, 829, 23.0, "", 683, 18.9, "", 6, "", 235, 15, "—", 0, "", "10-15", 0, "", 6, 0.0, "", "", "", "", ""],
  ["Lons-le-Saunier", 11799, 2410, 20.4, "", 3066, 26.0, "", 15, "", 772, 50, "Jérôme 3, Nassim 6", 9, "", "10-15", 1, "", 15, 6.7, "", "", "", "", ""],
  ["Besançon", 2255, 530, 23.5, "", 453, 20.1, "", 7, "", 347, 20, "Thomas (RZ) 1", 1, "", "10-15", 0, "", 7, 0.0, "", "", "", "", ""],
  ["ZONE", 35519, 9058, 25.5, "", 8301, 23.4, "", 58, "", 3531, 160, "", 15, "", "10-15", 4, "", 58, 6.9, "", "Synthèse ZONE acc", "Synthèse ZONE GP", "", ""],
];

const STORES = ["Pontarlier", "Lons-le-Saunier", "Dijon", "Besançon", "Chalon-sur-Saône"];
let failures = 0;
const fail = (msg) => { console.error("❌", msg); failures++; };

// --- Cas nominal ---
const { page1, page2, zoneComment } = buildMagasinsFromRows(FIXTURE);
for (const s of STORES) {
  if (!page1.accessoires[s]) fail(`accessoires manquant pour ${s}`);
  if (!page1.gp[s]) fail(`gp manquant pour ${s}`);
  if (!page1.occasion[s]) fail(`occasion manquant pour ${s}`);
  if (!page2.mobileo[s]) fail(`mobileo manquant pour ${s}`);
  if (!page2.atm[s]) fail(`atm manquant pour ${s}`);
}
if (page1.accessoires.ZONE) fail("ZONE ne doit pas apparaître comme magasin");
if (page2.mobileo.Pontarlier.vendeurs.Mathis !== 2) fail("détail vendeur Pontarlier/Mathis incorrect");
if (page2.atm["Lons-le-Saunier"].ratio !== 6.7) fail("ratio ATM Lons-le-Saunier incorrect");
if (!zoneComment.acc.includes("ZONE acc")) fail("commentaire ZONE accessoires non lu");

// --- Cas de régression : cellule d'en-tête "Magasin" vidée (incident du 17/09/2026) ---
const brokenHeader = FIXTURE.map((r) => [...r]);
brokenHeader[3] = [...brokenHeader[3]];
brokenHeader[3][0] = ""; // en-tête "Magasin" effacé par erreur
try {
  buildMagasinsFromRows(brokenHeader);
  fail("un en-tête manquant aurait dû lever une erreur (régression du bug du 17/09/2026)");
} catch (e) {
  if (!/Magasin/.test(e.message)) fail(`l'erreur levée ne nomme pas la colonne manquante : ${e.message}`);
}

if (failures) {
  console.error(`\n${failures} test(s) en échec.`);
  process.exit(1);
}
console.log("✅ Tous les tests magasins passent.");
