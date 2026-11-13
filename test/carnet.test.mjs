// Tests du carnet de réparations : logique pure, sans appel Google.
import assert from "node:assert/strict";
import { etatAcquis, valider, apprenantsVisibles, ligneVersInter } from "../src/carnet.js";
import { denyTrainee, denyFormationSeule, login } from "../src/auth.js";

let ok = 0;
const t = (nom, fn) => { fn(); ok++; console.log("  ✓", nom); };

const r = (o) => ({ id: "R" + Math.random(), date: "2026-11-18", marque: "Apple", modele: "iPhone 12", categorie: "Écran",
  autonomie: "Guidé", test: "OK du 1er coup", temps: 60, ...o });

t("acquis pas commencé / en cours", () => {
  const a = etatAcquis([r({})], {});
  assert.equal(a.find(x => x.id === "ecran-apple").statut, "En cours");
  assert.equal(a.find(x => x.id === "ecran-samsung").statut, "Pas commencé");
});

t("prêt à valider : 3 réparations, 2 dernières seul + OK", () => {
  const l = [r({ date: "2026-11-18", temps: 90 }), r({ date: "2026-11-20", autonomie: "Seul", temps: 60 }), r({ date: "2026-11-22", autonomie: "Seul", temps: 40 })];
  const e = etatAcquis(l, {}).find(x => x.id === "ecran-apple");
  assert.equal(e.statut, "Prêt à valider");
  assert.equal(e.tempsPremiers, 75);
  assert.equal(e.tempsDerniers, 50);
});

t("pas prêt si dernier test repris", () => {
  const l = [r({}), r({ date: "2026-11-20", autonomie: "Seul" }), r({ date: "2026-11-22", autonomie: "Seul", test: "OK après reprise" })];
  assert.equal(etatAcquis(l, {}).find(x => x.id === "ecran-apple").statut, "En cours");
});

t("validation humaine prime", () => {
  const e = etatAcquis([r({})], { "ecran-apple": { par: "Narcisse", date: "2026-11-25" } }).find(x => x.id === "ecran-apple");
  assert.equal(e.statut, "Validé");
});

t("Android vs Apple séparés", () => {
  const e = etatAcquis([r({ marque: "Xiaomi", categorie: "Batterie" })], {});
  assert.equal(e.find(x => x.id === "batterie-android").n, 1);
  assert.equal(e.find(x => x.id === "batterie-apple").n, 0);
});

t("saisie validée et arrondie", () => {
  const v = valider({ marque: "Samsung", modele: "A54", categorie: "Écran", autonomie: "Seul", difficulte: "3", temps: "45,4", test: "OK du 1er coup" });
  assert.equal(v.temps, 45); assert.equal(v.difficulte, 3); assert.match(v.date, /^\d{4}-\d{2}-\d{2}$/);
});

t("saisie incomplète refusée", () => {
  assert.throws(() => valider({ marque: "Samsung", modele: "A54", categorie: "Écran", autonomie: "Seul", difficulte: 3, temps: 0, test: "OK du 1er coup" }), /temps/);
  assert.throws(() => valider({ marque: "Samsung", modele: "", categorie: "Écran" }), /modèle/);
});

t("visibilité des carnets", () => {
  assert.deepEqual(apprenantsVisibles({ role: "trainee", name: "Killiann Correjou", store: "Pontarlier" }).map(a => a.name), ["Killiann Correjou"]);
  const pont = apprenantsVisibles({ role: "store", store: "Pontarlier" }).map(a => a.name);
  assert.ok(pont.includes("Killiann Correjou")); assert.ok(!pont.includes("Maëlle Martin"));
  assert.equal(apprenantsVisibles({ role: "store", store: "Chalon-sur-Saône" }).length, 0);
});

t("relecture ligne Sheets", () => {
  const x = ligneVersInter(["R1", "2026-11-18", "Killiann Correjou", "Pontarlier", "Apple", "iPhone 11", "Batterie", "", "", "Seul", 2, 35, "OK du 1er coup"], 0);
  assert.equal(x.temps, 35); assert.equal(x.ligne, 2); assert.equal(x.commentaire, "");
});

t("denyTrainee bloque visites/alternance", () => {
  let code = 0, suivant = false;
  const res = { status: (c) => { code = c; return { json: () => {} }; } };
  denyTrainee({ user: { role: "trainee" } }, res, () => { suivant = true; });
  assert.equal(code, 403); assert.equal(suivant, false);
  denyTrainee({ user: { role: "store" } }, res, () => { suivant = true; });
  assert.equal(suivant, true);
});

t("stagiaire : formation seule, carnet visible par Dijon", () => {
  let code = 0;
  const res = { status: (c) => { code = c; return { json: () => {} }; } };
  denyFormationSeule({ user: { role: "trainee", formationSeule: true, accesJusquau: "2999-12-31" } }, res, () => {});
  assert.equal(code, 403);
  const dij = apprenantsVisibles({ role: "store", store: "Dijon" }).map(a => a.name);
  assert.deepEqual(dij, ["Leny Dufieux"]);
  assert.equal(apprenantsVisibles({ role: "rz" })[0].role, "trainee");
});

t("stagiaire : connexion coupée après la fin du stage", () => {
  process.env.PWD_LENY_DUFIEUX = "x";
  const ok = login("leny.dufieux", "x");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  if (today <= "2026-12-19") assert.ok(ok && ok.user.formationSeule);
  else assert.equal(ok, null);
});

console.log(`carnet : ${ok} tests OK`);
