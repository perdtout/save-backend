// Test sans réseau du classeur Tarifs_V2_Save (taux horaire).
import { buildTarifsV2, tarifsPourUtilisateur } from "../src/tarifs.js";

let failures = 0;
const check = (cond, msg) => { if (!cond) { console.error("❌", msg); failures++; } };

// Mise en page réelle de l'onglet « Tarifs V2 » (lignes 1 à 4).
const v2 = [
  ["TARIFS V2 — simulation au taux horaire"],
  ["Tu saisis : prix d'achat…"],
  ["", "", "", "Temps de réparation (hors prise en charge)", "", "", "Écran origine", "", "", "", "Écran compatible 1", "", "", "", "", "Écran compatible 2", "", "", "", "", "Coque arrière", "", "", "", "Batterie origine", "", "", "", "Batterie compatible"],
  ["Marque", "Modèle", "GP (€ TTC)", "Temps écran (min)", "Temps batterie (min)", "Temps coque arrière (min)",
    "PA (€ HT)", "Prix V2", "Prix actuel", "Écart",
    "Gamme", "PA (€ HT)", "Prix V2", "Prix actuel", "Écart",
    "Gamme", "PA (€ HT)", "Prix V2", "Prix actuel", "Écart",
    "PA (€ HT)", "Prix V2", "Prix actuel", "Écart",
    "PA (€ HT)", "Prix V2", "Prix actuel", "Écart",
    "PA (€ HT)", "Prix V2", "Prix actuel", "Écart", "Actif", "Remarque"],
  ["Apple", "iPhone 8", 29.99, 15, 15, "", "", "", "", "", "Spark / LTPS", 9, 49.99, 49.99, 0, "", "", "", "", "", "", 69.9, 69.9, 0, "", "", "", "", 8, 49.99, 39.99, 10, "Oui", ""],
  ["Apple", "iPhone 15", 49.99, 15, 15, "", "", "", "", "", "Bolt", 30, 89.99, "", "", "", "", "", "", "", 20, 69.99, "", "", "", "", "", "", "", "", "", "", "Oui", ""],
  ["Samsung", "Galaxy A14", 29.99, 25, 15, 5, 30, 99.99, 69.99, 30, "Incell LCD", 14, 69.99, "", "", "", "", "", "", "", 8, 29.99, "", "", 15, 59.99, 59.9, 0, "", "", "", "", "Oui", "Attention plusieurs versions"],
  ["Samsung", "Galaxy Old", 19.99, 25, 15, 5, 30, 99.99, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Non", ""],
];
const params = [
  ["PARAMÈTRES DE CALCUL"],
  ["", "", "", "", "PRIX FIXES"],
  ["Paramètre", "Valeur", "Explication", "", "Apple", "iPhone 8", "Vitre arrière", 69.9],
  ["Taux horaire (€ HT)", 70, "", "", "Apple", "iPhone XR", "Vitre arrière", 69.9],
  ["Temps de prise en charge client (min)", 10],
  ["Coefficient pièce", 1.3], ["TVA", 1.2], ["Arrondi (€)", 10], ["Décote (€)", 0.01],
  ["Temps écran par défaut (min)", 15], ["Temps batterie par défaut (min)", ""],
];
const micro = [["Prestation", "Prix TTC", "Remarque"], ["Connecteur de charge", 89.99, ""]];

const d = buildTarifsV2({ v2, params, micro });
check(d.version === 2, "version 2");
check(d.params.taux === 70 && d.params.pec === 10, "taux 70 € / PEC 10 min lus");
const apple = d.marques.find(m => m.nom === "Apple");
const sam = d.marques.find(m => m.nom === "Samsung");
check(apple && sam, "deux marques");
check(sam.modeles.length === 1, "modèle Actif = Non exclu");

const i8 = apple.modeles.find(m => m.nom === "iPhone 8");
const ids = i8.reparations.map(r => r.id).join(",");
check(ids === "ecran-compat-1,vitre-ar,batterie-compat", `iPhone 8 : réparations ${ids}`);
const c1 = i8.reparations[0];
check(c1.prix === 49.99 && c1.gamme === "Spark / LTPS" && c1.pa === 9, "écran compatible : prix V2 + gamme + PA");
check(c1.temps === 15 && c1.mo === 29.17, `MO = (15 + 10) × 70 / 60 = 29,17 (reçu ${c1.mo})`);
check(c1.prixAvecGP === 79.98, "prix avec GP");
const coque8 = i8.reparations[1];
check(coque8.source === "fixe" && coque8.prix === 69.9, "coque iPhone 8 : prix fixe");
check(coque8.libelle === "Coque arrière", "libellé Coque arrière");
check(coque8.magasins.join() === "Pontarlier", "coque iPhone 8 : Pontarlier uniquement");

const i15 = apple.modeles.find(m => m.nom === "iPhone 15");
const coque15 = i15.reparations.find(r => r.id === "vitre-ar");
check(coque15.magasins.length === 0, "coque iPhone 15 : tous magasins");
check(coque15.temps === null && d.anomalies.some(a => a.includes("iPhone 15") && a.includes("temps")), "temps coque manquant signalé");

const a14 = sam.modeles[0];
check(a14.reparations.find(r => r.id === "ecran-origine").mo === 40.83, "A14 écran origine : (25+10)×70/60");
check(a14.reparations.find(r => r.id === "vitre-ar").temps === 5, "A14 coque : 5 min");
check(d.microSoudure.length === 1, "micro-soudure lue");

const mag = tarifsPourUtilisateur(d, { role: "magasin" });
const r0 = mag.marques[0].modeles[0].reparations[0];
check(!("pa" in r0) && !("mo" in r0) && !("temps" in r0) && !("margeHT" in r0), "magasin : pas de PA/MO/temps/marge");
check(!("anomalies" in mag), "magasin : pas d'anomalies");

if (failures) { console.error(`${failures} échec(s)`); process.exit(1); }
console.log("✅ tarifs V2 : tous les tests passent");
