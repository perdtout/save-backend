// ─── Course GOAT — championnat de saison (barème F1) + courses du mois / de la semaine ───
// Décisions de Thomas (22/10/2026) :
//  • saison de juin à mai ; championnat recalculé depuis juin 2026 ;
//  • points façon F1 à chaque classement hebdo : 10/8/6/5/4/3/2/1, mensuel ×3 ;
//  • les titres MVP restent : le MVP désigné prend toujours la 1re place de sa période
//    (Thomas a parfois tranché à la main, cf. methode-goat.md), les autres suivent au score ;
//  • un vendeur absent toute la période (score 0 ou vide) ne marque pas de point ;
//  • scores des vendeurs affichés.
// Pour la semaine et le mois EN COURS, aucune ligne officielle n'existe encore :
// le score est recalculé chaque jour à partir des lignes "Jour" (barème 5 × 20).

const POINTS_SEMAINE = [10, 8, 6, 5, 4, 3, 2, 1];
const MULT_MOIS = 3;

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const utc = (y, m, j) => new Date(Date.UTC(y, m, j));

// Jours fériés français (métropole)
function paques(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, mois - 1, jour);
}
export function joursFeries(y) {
  const p = paques(y);
  return new Set([
    utc(y, 0, 1), addDays(p, 1), utc(y, 4, 1), utc(y, 4, 8), addDays(p, 39), addDays(p, 50),
    utc(y, 6, 14), utc(y, 7, 15), utc(y, 10, 1), utc(y, 10, 11), utc(y, 11, 25),
  ].map(iso));
}
// Ouvert du mardi (2) au samedi (6), hors fériés
export function estOuvre(d) {
  const w = d.getUTCDay();
  return w >= 2 && w <= 6 && !joursFeries(d.getUTCFullYear()).has(iso(d));
}
export function joursOuvresDuMois(y, m) {
  const out = [];
  for (let d = utc(y, m, 1); d.getUTCMonth() === m; d = addDays(d, 1)) if (estOuvre(d)) out.push(iso(d));
  return out;
}
// Semaine de travail (mardi → samedi) contenant la date ; dimanche/lundi → la semaine qui vient de finir
export function semaineDe(d) {
  const w = d.getUTCDay();
  const recul = w >= 2 ? w - 2 : w + 5; // dim → 5, lun → 6
  const mardi = addDays(d, -recul);
  return [0, 1, 2, 3, 4].map(i => iso(addDays(mardi, i)));
}
export function saisonDe(isoDate) {
  const [y, m] = isoDate.split("-").map(Number);
  const debut = m >= 6 ? y : y - 1;
  return { cle: `${debut}-${debut + 1}`, debut: `${debut}-06-01`, fin: `${debut + 1}-05-31`, annee: debut };
}

// ─── Score live (barème 5 × 20) à partir des lignes "Jour" ───────────────────
// objectifs individuels : Mobileo et Protected 1,5/semaine, 6/mois (methode-goat.md)
export function scoreLive(jours, objectif) {
  let marge = 0, acc = 0, gp = 0, mobileo = 0, atm = 0, prime = 0, protectedN = 0, solo = false, actif = false;
  for (const r of jours) {
    marge += r.margeTotale || 0; acc += r.margeAccessoires || 0; gp += r.margeGP || 0;
    mobileo += r.mobileo || 0; atm += r.atm || 0; prime += r.primeAtm || 0; protectedN += r.protected || 0;
    if (r.isSolo) solo = true;
    if ((r.margeTotale || 0) > 0 || r.mobileo || r.atm || r.protected) actif = true;
  }
  if (!actif) return { total: 0, actif: false, breakdown: { accessoires: 0, gp: 0, mobileo: 0, atm: 0, protected: 0 }, isSolo: solo };
  const cap = (x) => Math.max(0, Math.min(x, 1)) * 20;
  const rAcc = marge > 0 ? (acc / marge) * 100 : 0, rGP = marge > 0 ? (gp / marge) * 100 : 0;
  const b = {
    accessoires: cap(rAcc / 25),
    gp: cap(rGP / 20),
    mobileo: cap(mobileo / objectif),
    // Prime ATM € quand elle est saisie ; sinon pratique constatée sur les lignes
    // hebdo depuis septembre : au moins un ATM vendu = 20/20.
    atm: prime > 0 ? Math.min(prime, 20) : (atm >= 1 ? 20 : 0),
    protected: cap(protectedN / objectif),
  };
  const brut = Object.values(b).reduce((s, v) => s + v, 0);
  const total = Math.min(100, Math.round(brut * (solo ? 1.1 : 1) * 10) / 10);
  Object.keys(b).forEach(k => { b[k] = Math.round(b[k] * 10) / 10; });
  return { total, actif: true, breakdown: b, isSolo: solo,
    stats: { marge: Math.round(marge), ratioAcc: +rAcc.toFixed(1), ratioGP: +rGP.toFixed(1), mobileo, atm, protected: protectedN } };
}

// ─── Points d'une période ────────────────────────────────────────────────────
// entries : [{ name, store, total, mvp }] → [{ ...entry, pos, points }]
export function pointsPeriode(entries, mult = 1) {
  const classes = entries.filter(e => (e.total || 0) > 0 || e.mvp)
    .sort((a, b) => (!!b.mvp - !!a.mvp) || (b.total - a.total));
  const out = [];
  classes.forEach((e, i) => {
    const prev = out[i - 1];
    // égalité exacte de score (hors MVP) = même place, mêmes points
    const pos = prev && !e.mvp && !prev.mvp && prev.total === e.total ? prev.pos : i + 1;
    out.push({ ...e, pos, points: (POINTS_SEMAINE[pos - 1] || 0) * mult });
  });
  entries.filter(e => !((e.total || 0) > 0 || e.mvp)).forEach(e => out.push({ ...e, pos: null, points: 0 }));
  return out;
}

const groupBy = (rows, key) => rows.reduce((m, r) => { (m[key(r)] = m[key(r)] || []).push(r); return m; }, {});
const MOIS_COURTS = ["juin", "juil.", "août", "sept.", "oct.", "nov.", "déc.", "janv.", "févr.", "mars", "avr.", "mai"];
const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_COURTS = { 2: "mar.", 3: "mer.", 4: "jeu.", 5: "ven.", 6: "sam." };

function classementLive(joursRows, objectif) {
  const parVendeur = groupBy(joursRows, r => r.name);
  return Object.entries(parVendeur).map(([name, rs]) => {
    const s = scoreLive(rs, objectif);
    return { name, store: rs[rs.length - 1].store, ...s, mvp: false };
  }).sort((a, b) => b.total - a.total);
}

export function buildRace(rows, today = new Date()) {
  const auj = iso(today);
  const saison = saisonDe(auj);
  const dansSaison = (r) => r.date >= saison.debut && r.date <= saison.fin;
  const officiels = rows.filter(r => (r.periodType === "Semaine" || r.periodType === "Mois") && r.date && dansSaison(r));
  const joursRows = rows.filter(r => r.periodType === "Jour" && r.date && r.date <= auj);

  // ── Semaine en cours ──
  const sem = semaineDe(today);
  const semOfficielle = officiels.filter(r => r.periodType === "Semaine" && r.date >= sem[0] && r.date <= sem[4]);
  const semJours = sem.filter(d => estOuvre(new Date(d + "T00:00:00Z")));
  const semFaits = semJours.filter(d => d <= auj);
  const semaine = {
    label: `Semaine du ${Number(sem[0].slice(8))} au ${Number(sem[4].slice(8))} ${MOIS_LONGS[Number(sem[4].slice(5, 7)) - 1]}`,
    officielle: semOfficielle.length > 0,
    paliers: sem.map(d => ({ date: d, label: JOURS_COURTS[new Date(d + "T00:00:00Z").getUTCDay()], ouvre: semJours.includes(d) })),
    jourIndex: semFaits.length, joursTotal: semJours.length,
    dernierJourSaisi: null,
    classement: [],
  };
  if (semaine.officielle) {
    semaine.classement = semOfficielle.map(r => ({ name: r.name, store: r.store, total: r.total, isSolo: r.isSolo, breakdown: r.breakdown, mvp: r.mvp }))
      .sort((a, b) => (!!b.mvp - !!a.mvp) || (b.total - a.total));
  } else {
    const rs = joursRows.filter(r => r.date >= sem[0] && r.date <= sem[4]);
    semaine.dernierJourSaisi = rs.reduce((m, r) => (r.date > m ? r.date : m), "") || null;
    semaine.classement = classementLive(rs, 1.5);
  }
  semaine.classement = pointsPeriode(semaine.classement, 1);

  // ── Mois en cours ──
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  const debutMois = iso(utc(y, m, 1)), finMois = iso(utc(y, m + 1, 0));
  const joursMois = joursOuvresDuMois(y, m);
  const moisOfficiel = officiels.filter(r => r.periodType === "Mois" && r.date >= debutMois && r.date <= finMois);
  const mois = {
    label: `${MOIS_LONGS[m].charAt(0).toUpperCase()}${MOIS_LONGS[m].slice(1)} ${y}`,
    officielle: moisOfficiel.length > 0,
    paliers: joursMois.map(d => ({ date: d, label: String(Number(d.slice(8))) })),
    jourIndex: joursMois.filter(d => d <= auj).length, joursTotal: joursMois.length,
    dernierJourSaisi: null,
    classement: [],
  };
  if (mois.officielle) {
    mois.classement = moisOfficiel.map(r => ({ name: r.name, store: r.store, total: r.total, isSolo: r.isSolo, breakdown: r.breakdown, mvp: r.mvp }))
      .sort((a, b) => (!!b.mvp - !!a.mvp) || (b.total - a.total));
  } else {
    const rs = joursRows.filter(r => r.date >= debutMois && r.date <= finMois);
    mois.dernierJourSaisi = rs.reduce((mx, r) => (r.date > mx ? r.date : mx), "") || null;
    mois.classement = classementLive(rs, 6);
  }
  mois.classement = pointsPeriode(mois.classement, MULT_MOIS);

  // ── Championnat de saison (périodes officielles uniquement) ──
  const periodes = Object.values(groupBy(officiels, r => `${r.periodType}|${r.date}|${r.periodLabel}`)).map(rs => ({
    type: rs[0].periodType === "Mois" ? "month" : "week",
    label: rs[0].periodLabel, start: rs[0].date,
    resultats: pointsPeriode(rs.map(r => ({ name: r.name, store: r.store, total: r.total, mvp: r.mvp })),
      rs[0].periodType === "Mois" ? MULT_MOIS : 1),
  })).sort((a, b) => a.start.localeCompare(b.start) || (a.type === "week" ? -1 : 1));

  const coureurs = {};
  const moisIndex = (d) => { const mm = Number(d.slice(5, 7)); return (mm - 6 + 12) % 12; };
  for (const p of periodes) {
    for (const r of p.resultats) {
      const c = coureurs[r.name] = coureurs[r.name] || { name: r.name, store: r.store, points: 0, semaines: 0, mois: 0, podiums: 0, parMois: Array(12).fill(0) };
      c.store = r.store || c.store;
      c.points += r.points;
      c.parMois[moisIndex(p.start)] += r.points;
      if (r.mvp) p.type === "month" ? c.mois++ : c.semaines++;
      if (r.pos && r.pos <= 3) c.podiums++;
    }
  }
  const moisCourant = moisIndex(auj);
  const classementSaison = Object.values(coureurs).map(c => {
    let cumul = 0;
    const cumulParMois = c.parMois.map((v, i) => (i <= moisCourant ? (cumul += v) : null));
    return { ...c, cumulParMois,
      provisoire: (semaine.officielle ? 0 : (semaine.classement.find(x => x.name === c.name)?.points || 0))
        + (mois.officielle ? 0 : (mois.classement.find(x => x.name === c.name)?.points || 0)) };
  }).sort((a, b) => b.points - a.points || b.mois - a.mois || b.semaines - a.semaines);
  let prevPos = 0;
  classementSaison.forEach((c, i) => { c.pos = i > 0 && classementSaison[i - 1].points === c.points ? prevPos : i + 1; prevPos = c.pos; });

  return {
    bareme: { semaine: POINTS_SEMAINE, multMois: MULT_MOIS },
    saison: {
      cle: saison.cle, label: `Juin ${saison.annee} — Mai ${saison.annee + 1}`,
      paliers: MOIS_COURTS, moisIndex: moisCourant,
      // avancement de la saison en jours ouvrés (pour placer le "front" de course)
      avancement: (() => {
        const tous = []; for (let i = 0; i < 12; i++) tous.push(...joursOuvresDuMois(saison.annee + (i >= 7 ? 1 : 0), (5 + i) % 12));
        return +(tous.filter(d => d <= auj).length / tous.length).toFixed(4);
      })(),
      periodesComptees: { semaines: periodes.filter(p => p.type === "week").length, mois: periodes.filter(p => p.type === "month").length },
      classement: classementSaison,
      periodes: periodes.map(p => ({ type: p.type, label: p.label, start: p.start,
        resultats: p.resultats.map(r => ({ name: r.name, pos: r.pos, points: r.points, total: r.total, mvp: r.mvp })) })),
    },
    mois, semaine,
    calculeLe: auj,
  };
}
