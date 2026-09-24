// Test sans réseau de la page Tarifs : règle de prix, prix fixes, garde-fous.
// Lancer avec : npm test
import { buildTarifs, prixVente, tarifsPourUtilisateur } from "../src/tarifs.js";

let failures = 0;
const check = (cond, msg) => { if (!cond) { console.error("❌", msg); failures++; } };

// Règle de l'ancien fichier Excel : ((PA × 1,3) + MO) × 1,2, arrondi à la dizaine, − 0,01
check(prixVente(31, 30) === 79.99, "iPhone 14 Bolt : 31 € + 30 € de MO → 79,99 €");
check(prixVente(420, 50) === 719.99, "Fold 5 intérieur : 420 € + 50 € → 719,99 €");
check(prixVente(11, 20) === 39.99, "iPhone 11 Pro : 11 € + 20 € → 39,99 €");
check(prixVente(31, 30, { coef: 1.3, tva: 1.2, arrondi: 10, decote: 0 }) === 80, "décote à 0 → prix rond");

const HEAD = ["Marque", "Modèle", "GP (€ TTC)", "Écran origine PA", "Écran origine MO",
  "Écran compatible 1 gamme", "Écran compatible 1 PA", "Écran compatible 1 MO",
  "Écran compatible 2 gamme", "Écran compatible 2 PA", "Écran compatible 2 MO",
  "Vitre arrière PA", "Vitre arrière MO", "Batterie origine PA", "Batterie origine MO",
  "Batterie compatible PA", "Batterie compatible MO", "Actif", "Remarque"];
const rows = {
  tarifs: [
    ["TARIFS"], ["note"], HEAD,
    ["Apple", "iPhone 14", 49.99, "", "", "Bolt", 31, 30, "Spark", 13, 35, "", "", "", "", "", "", "Oui", ""],
    ["Apple", "iPhone 13", 39.99, "", "", "Spark / LTPS", 13, "", "", "", "", "", "", "", "", "", "", "Oui", ""],   // MO manquante
    ["Apple", "iPhone 12", 39.99, "", "", "Spark / LTPS", 46279, 25, "", "", "", "", "", "", "", "", "", "Oui", ""], // date déguisée
    ["Samsung", "Galaxy A14", 29.99, 30, 20, "", "", "", "", "", "", "", "", "", "", "", "", "Oui", ""],
    ["Samsung", "Galaxy A15", 29.99, 30, 25, "", "", "", "", "", "", "", "", "", "", "", "", "Non", ""],         // inactif
  ],
  fixes: [["PRIX FIXES"], [""], ["Marque", "Modèle", "Réparation", "Prix TTC"],
    ["Apple", "iPhone 14", "Vitre arrière", 99.9],
    ["Samsung", "Galaxy A14", "Batterie origine", 39],
    ["Samsung", "Galaxy A14", "Écran origine", 999]],   // ignoré : le PA est saisi
  micro: [["MICRO"], [""], ["Prestation", "Prix TTC", "Remarque"], ["Puce tactile", 99.9, ""]],
  params: [["PARAM"], [""], ["Paramètre", "Valeur"], ["Coefficient pièce", 1.3], ["TVA", 1.2], ["Arrondi", 10], ["Décote", 0.01],
    ["Magasins vitre arrière", "Pontarlier"], ["Magasins micro-soudure", "Dijon, Lons-le-Saunier"]],
};
const t = buildTarifs(rows);
const trouver = (marque, modele) => t.marques.find(m => m.nom === marque)?.modeles.find(m => m.nom === modele);
const i14 = trouver("Apple", "iPhone 14");
check(i14?.reparations.map(r => r.id).join() === "ecran-compat-1,ecran-compat-2,vitre-ar", "iPhone 14 : Bolt, Spark, vitre");
check(i14?.reparations[0].prix === 79.99 && i14?.reparations[0].prixAvecGP === 129.98, "iPhone 14 Bolt 79,99 / avec GP 129,98");
check(i14?.reparations[0].gamme === "Bolt", "gamme lue");
check(i14?.reparations[2].source === "fixe" && i14?.reparations[2].prix === 99.9, "vitre arrière en prix fixe");
check(!trouver("Apple", "iPhone 13"), "PA sans MO → pas de prix inventé");
check(!trouver("Apple", "iPhone 12"), "date déguisée → écartée");
check(t.anomalies.length === 2, `2 anomalies signalées (reçu ${t.anomalies.length})`);
const a14 = trouver("Samsung", "Galaxy A14");
check(a14?.reparations.find(r => r.id === "ecran-origine")?.prix === 69.99, "le PA saisi prime sur le prix fixe");
check(a14?.reparations.find(r => r.id === "batterie-origine")?.prix === 39, "batterie en prix fixe");
check(!trouver("Samsung", "Galaxy A15"), "Actif = Non → masqué");
check(t.params.magasinsMicro.join() === "Dijon,Lons-le-Saunier", "liste des magasins micro-soudure");
check(t.microSoudure.length === 1, "micro-soudure lue");

// Un compte magasin ne reçoit ni PA, ni MO, ni marge, ni anomalies
const vueMagasin = tarifsPourUtilisateur({ ...t, sheetUrl: "x" }, { role: "store", store: "Dijon" });
const r0 = vueMagasin.marques[0].modeles[0].reparations[0];
check(!("pa" in r0) && !("mo" in r0) && !("margeHT" in r0), "prix d'achat masqués au magasin");
check(!("anomalies" in vueMagasin) && !("sheetUrl" in vueMagasin), "anomalies et lien du classeur masqués au magasin");

// Sans ligne d'en-tête « Marque », erreur explicite plutôt qu'une page vide
let erreur = null;
try { buildTarifs({ tarifs: [["x"], ["y"]] }); } catch (e) { erreur = e; }
check(erreur && /Marque/.test(erreur.message), "en-tête manquant → erreur explicite");

if (failures) { console.error(`\n${failures} échec(s) — tarifs`); process.exit(1); }
console.log("✅ Tarifs : tous les tests passent");
