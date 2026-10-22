// Course GOAT : barème F1, saison juin→mai, jours ouvrés, score live.
// Lancer avec : npm test
import { buildRace, pointsPeriode, joursOuvresDuMois, semaineDe, scoreLive } from "../src/goatRace.js";

let failures = 0;
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("❌", msg, "→ attendu", b, "obtenu", a); failures++; } };

// Jours ouvrés (mardi→samedi hors fériés)
eq(joursOuvresDuMois(2026, 9).length, 23, "octobre 2026 = 23 jours ouvrés");
eq(joursOuvresDuMois(2026, 10).length, 19, "novembre 2026 = 19 (11/11 férié, mercredi)");
eq(semaineDe(new Date("2026-10-22T12:00:00Z")), ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"], "semaine du jeudi 22/10");
eq(semaineDe(new Date("2026-10-26T12:00:00Z"))[0], "2026-10-20", "un lundi renvoie la semaine écoulée");

// Points : MVP désigné en tête, absents à 0, égalité = mêmes points
const pts = pointsPeriode([
  { name: "A", total: 80 }, { name: "B", total: 70, mvp: true }, { name: "C", total: 60 },
  { name: "D", total: 60 }, { name: "E", total: 0 },
]);
eq(pts.map(p => [p.name, p.points]), [["B", 10], ["A", 8], ["C", 6], ["D", 6], ["E", 0]], "points F1 semaine");
eq(pointsPeriode([{ name: "A", total: 50 }], 3)[0].points, 30, "mois ×3");

// Score live : 1 Mobileo sur objectif 1,5 = 13,3 ; ratios au-dessus des objectifs = 20 ; solo +10 %
const s = scoreLive([{ margeTotale: 1000, margeAccessoires: 300, margeGP: 250, mobileo: 1, atm: 0, protected: 0 }], 1.5);
eq(s.total, 53.3, "score live 20+20+13,3");
const solo = scoreLive([{ margeTotale: 1000, margeAccessoires: 300, margeGP: 250, mobileo: 2, atm: 1, protected: 2, isSolo: true }], 1.5);
eq(solo.total, 100, "score live plafonné à 100");

// Saison complète
const rows = [
  { periodType: "Semaine", date: "2026-05-26", periodLabel: "S hors saison", name: "A", store: "X", total: 90, mvp: true },
  { periodType: "Semaine", date: "2026-06-09", periodLabel: "S1", name: "A", store: "X", total: 80, mvp: true },
  { periodType: "Semaine", date: "2026-06-09", periodLabel: "S1", name: "B", store: "Y", total: 60, mvp: false },
  { periodType: "Mois", date: "2026-06-01", periodLabel: "juin 2026", name: "B", store: "Y", total: 90, mvp: true },
  { periodType: "Mois", date: "2026-06-01", periodLabel: "juin 2026", name: "A", store: "X", total: 70, mvp: false },
  { periodType: "Jour", date: "2026-10-21", name: "A", store: "X", margeTotale: 500, margeAccessoires: 150, margeGP: 120, mobileo: 0 },
  { periodType: "Jour", date: "2026-10-21", name: "B", store: "Y", margeTotale: 500, margeAccessoires: 50, margeGP: 50, mobileo: 0 },
];
const race = buildRace(rows, new Date("2026-10-22T12:00:00Z"));
eq(race.saison.classement.map(c => [c.name, c.points]), [["B", 38], ["A", 34]], "championnat juin 2026 (hors saison ignoré)");
eq([race.mois.jourIndex, race.mois.joursTotal], [16, 23], "mois : 16e jour ouvré sur 23");
eq([race.semaine.jourIndex, race.semaine.officielle], [3, false], "semaine live, jour 3/5");
eq(race.semaine.classement.map(c => [c.name, c.points]), [["A", 10], ["B", 8]], "semaine live classée au score");
eq(race.saison.classement[0].provisoire, 8 + 24, "points en jeu pour B (semaine + mois)");

if (failures) { console.error(`${failures} échec(s)`); process.exit(1); }
console.log("✅ goat-race : tous les tests passent");
