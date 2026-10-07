// ─── tarifs.js ───────────────────────────────────────────────────────────────
// Page « Tarifs » : lit le classeur Google Sheets Tarifs_SAVE (variable
// GOOGLE_SHEET_TARIFS_ID) et calcule le prix de chaque réparation.
//
// Le classeur ne contient QUE des prix d'achat (PA) et des mains d'œuvre (MO) :
// le prix de vente est toujours recalculé ici, avec la même règle que le
// calculateur de l'app et que l'ancien fichier tarifsHG.xlsx :
//   prix TTC = arrondi à la dizaine de ((PA × 1,3) + MO) × 1,2, puis − 0,01 €
// Les coefficients sont lus dans l'onglet « Paramètres ».
//
// Onglets attendus (le texte des en-têtes compte, pas leur position) :
//   Tarifs         : Marque | Modèle | GP (€ TTC) | <Réparation> PA | <Réparation> MO | … | Actif | Remarque
//   Prix fixes     : Marque | Modèle | Réparation | Prix TTC   (utilisé tant que le PA est vide)
//                    Une vitre arrière APPLE listée ici ne se fait que dans les magasins
//                    « Magasins vitre arrière » (Pontarlier) ; les autres vitres, partout.
//   Micro-soudure  : Prestation | Prix TTC | Remarque
//   Paramètres     : Paramètre | Valeur
import { readRange } from "./sheets.js";

// Les six réparations proposées, dans l'ordre d'affichage.
// `col` = début du nom de colonne dans l'onglet Tarifs.
export const REPARATIONS = [
  { id: "ecran-origine",    col: "Écran origine",       famille: "Écran",         libelle: "Écran origine" },
  { id: "ecran-compat-1",   col: "Écran compatible 1",  famille: "Écran",         libelle: "Écran compatible", gammeCol: "Écran compatible 1 gamme" },
  { id: "ecran-compat-2",   col: "Écran compatible 2",  famille: "Écran",         libelle: "Écran compatible", gammeCol: "Écran compatible 2 gamme" },
  { id: "vitre-ar",         col: "Vitre arrière",       famille: "Vitre arrière", libelle: "Vitre arrière" },
  { id: "batterie-origine", col: "Batterie origine",    famille: "Batterie",      libelle: "Batterie origine" },
  { id: "batterie-compat",  col: "Batterie compatible", famille: "Batterie",      libelle: "Batterie compatible" },
];

export const PARAMS_DEFAUT = {
  coef: 1.3, tva: 1.2, arrondi: 10, decote: 0.01,
  magasinsVitre: ["Pontarlier"], magasinsMicro: ["Dijon"],
};

// Au-delà, une valeur de PA/MO est presque sûrement une date déguisée
// (piège de la saisie « 28.5 » en locale française → numéro de série ~46 000).
const MONTANT_MAX = 5000;

// ─── Utilitaires ─────────────────────────────────────────────────────────────
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const cle = (s) => str(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const round2 = (v) => Math.round(v * 100) / 100;

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).replace(/\s|€/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const liste = (v) => str(v).split(/[,;]/).map(s => s.trim()).filter(Boolean);

// Ligne d'en-tête = première ligne dont la 1re cellule vaut exactement `premier`.
function trouverEntete(rows, premier) {
  const i = rows.findIndex(r => cle(r?.[0]) === cle(premier));
  if (i < 0) return null;
  const h = rows[i].map(cle);
  return { ligne: i, idx: (nom) => h.indexOf(cle(nom)) };
}

// Même règle que Calculateur.jsx (arrondi à la dizaine, demi vers le haut),
// plus la décote de l'ancien fichier Excel (140 → 139,99).
export function prixVente(pa, mo, p = PARAMS_DEFAUT) {
  const brut = Math.round(((pa * p.coef) + mo) * p.tva * 1e6) / 1e6;
  const arrondi = p.arrondi > 0 ? Math.floor(brut / p.arrondi + 0.5) * p.arrondi : brut;
  if (arrondi <= 0) return 0;
  return round2(arrondi - (p.decote || 0));
}

// ─── Construction (sans réseau, testable) ───────────────────────────────────
export function buildTarifs({ tarifs = [], fixes = [], micro = [], params = [] }) {
  const anomalies = [];

  // Paramètres
  const p = { ...PARAMS_DEFAUT };
  const hp = trouverEntete(params, "Paramètre");
  if (hp) {
    for (const r of params.slice(hp.ligne + 1)) {
      const k = cle(r[0]); const v = r[1];
      if (!k) continue;
      if (k.startsWith("coefficient")) p.coef = num(v) ?? p.coef;
      else if (k === "tva") p.tva = num(v) ?? p.tva;
      else if (k === "arrondi") p.arrondi = num(v) ?? p.arrondi;
      else if (k === "decote") p.decote = num(v) ?? p.decote;
      else if (k.includes("vitre")) p.magasinsVitre = liste(v);
      else if (k.includes("micro")) p.magasinsMicro = liste(v);
    }
    for (const k of ["coef", "tva", "arrondi", "decote"]) {
      if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 100) {
        anomalies.push(`Paramètres : valeur « ${k} » illisible, valeur par défaut utilisée`);
        p[k] = PARAMS_DEFAUT[k];
      }
    }
  }

  // Prix fixes : clé "marque|modèle|réparation"
  const prixFixes = new Map();
  // Vitres arrière Apple listées dans Prix fixes = réalisées seulement à Pontarlier.
  const vitresRestreintes = new Set();
  const hf = trouverEntete(fixes, "Marque");
  if (hf) {
    const iM = hf.idx("Marque"), iMod = hf.idx("Modèle"), iRep = hf.idx("Réparation"), iP = hf.idx("Prix TTC");
    for (const r of fixes.slice(hf.ligne + 1)) {
      if (!str(r[iMod])) continue;
      const rep = REPARATIONS.find(x => cle(r[iRep]) === cle(x.col) || cle(r[iRep]) === cle(x.libelle));
      const prix = num(r[iP]);
      if (!rep) { anomalies.push(`Prix fixes : réparation « ${str(r[iRep])} » inconnue (${str(r[iMod])})`); continue; }
      if (rep.id === "vitre-ar" && cle(r[iM]) === "apple") vitresRestreintes.add(`${cle(r[iM])}|${cle(r[iMod])}`);
      if (prix == null || Number.isNaN(prix) || prix > MONTANT_MAX) { anomalies.push(`Prix fixes : prix illisible pour ${str(r[iMod])} — ${rep.col}`); continue; }
      prixFixes.set(`${cle(r[iM])}|${cle(r[iMod])}|${rep.id}`, prix);
    }
  }

  // Tarifs
  const ht = trouverEntete(tarifs, "Marque");
  if (!ht) throw new Error("Onglet Tarifs : ligne d'en-tête introuvable (la 1re cellule doit valoir « Marque »)");
  const iMarque = ht.idx("Marque"), iModele = ht.idx("Modèle"), iGP = ht.idx("GP (€ TTC)"),
    iActif = ht.idx("Actif"), iRem = ht.idx("Remarque");
  if (iModele < 0) throw new Error("Onglet Tarifs : colonne « Modèle » introuvable");

  const marques = new Map();
  for (const r of tarifs.slice(ht.ligne + 1)) {
    const marque = str(r[iMarque]); const modele = str(r[iModele]);
    if (!marque || !modele) continue;
    if (iActif >= 0 && cle(r[iActif]) === "non") continue;
    const ou = `${marque} ${modele}`;

    let gp = iGP >= 0 ? num(r[iGP]) : null;
    if (Number.isNaN(gp) || gp > MONTANT_MAX) { anomalies.push(`${ou} : GP illisible`); gp = null; }

    const reparations = [];
    for (const rep of REPARATIONS) {
      const iPA = ht.idx(`${rep.col} PA`), iMO = ht.idx(`${rep.col} MO`);
      const pa = iPA >= 0 ? num(r[iPA]) : null;
      const mo = iMO >= 0 ? num(r[iMO]) : null;
      const gamme = rep.gammeCol ? str(r[ht.idx(rep.gammeCol)]) : "";
      const base = { id: rep.id, famille: rep.famille, libelle: rep.libelle, gamme };

      if (pa != null) {
        if (Number.isNaN(pa) || pa > MONTANT_MAX) { anomalies.push(`${ou} — ${rep.col} : prix d'achat illisible (${str(r[iPA])})`); continue; }
        if (mo == null || Number.isNaN(mo) || mo > MONTANT_MAX) { anomalies.push(`${ou} — ${rep.col} : prix d'achat saisi mais main d'œuvre manquante`); continue; }
        const prix = prixVente(pa, mo, p);
        reparations.push({ ...base, source: "calcul", pa, mo, prix, margeHT: round2(prix / p.tva - pa) });
        continue;
      }
      const fixe = prixFixes.get(`${cle(marque)}|${cle(modele)}|${rep.id}`);
      if (fixe != null) reparations.push({ ...base, source: "fixe", pa: null, mo: null, prix: fixe, margeHT: null });
    }
    if (!reparations.length) continue;

    const restreinte = vitresRestreintes.has(`${cle(marque)}|${cle(modele)}`);
    for (const rp of reparations) {
      rp.prixAvecGP = gp ? round2(rp.prix + gp) : null;
      // Liste vide = faisable dans tous les magasins.
      rp.magasins = rp.id === "vitre-ar" && restreinte ? [...p.magasinsVitre] : [];
    }
    if (!marques.has(marque)) marques.set(marque, []);
    marques.get(marque).push({ nom: modele, gp, remarque: iRem >= 0 ? str(r[iRem]) : "", reparations });
  }

  // Micro-soudure
  const microSoudure = [];
  const hm = trouverEntete(micro, "Prestation");
  if (hm) {
    const iN = hm.idx("Prestation"), iP = hm.idx("Prix TTC"), iR = hm.idx("Remarque");
    for (const r of micro.slice(hm.ligne + 1)) {
      if (!str(r[iN])) continue;
      const prix = num(r[iP]);
      microSoudure.push({ prestation: str(r[iN]), prix: Number.isNaN(prix) ? null : prix, remarque: iR >= 0 ? str(r[iR]) : "" });
    }
  }

  return {
    params: p,
    marques: [...marques].map(([nom, modeles]) => ({ nom, modeles })),
    microSoudure,
    anomalies,
  };
}

// ─── Classeur V2 (taux horaire) ──────────────────────────────────────────────
// Tarifs_V2_Save calcule lui-même le prix (colonne « Prix V2 » de chaque bloc) :
//   prix = arrondi(((PA × coef) + (temps + prise en charge) × taux ÷ 60) × TVA) − décote
// L'app affiche ce prix tel quel ; le PA, le temps et la MO servent au détail RZ.
// Onglet « Tarifs V2 » : ligne de groupes (Écran origine, Écran compatible 1…)
// au-dessus d'une ligne d'en-têtes commençant par « Marque ».
// Onglet « Paramètres » : A/B = paramètres, E:H = copie des Prix fixes de Tarifs_SAVE.
const GROUPES_V2 = [
  { groupe: "Écran origine",       id: "ecran-origine",    famille: "Écran",         libelle: "Écran origine",       temps: "ecran" },
  { groupe: "Écran compatible 1",  id: "ecran-compat-1",   famille: "Écran",         libelle: "Écran compatible",    temps: "ecran" },
  { groupe: "Écran compatible 2",  id: "ecran-compat-2",   famille: "Écran",         libelle: "Écran compatible",    temps: "ecran" },
  { groupe: "Coque arrière",       id: "vitre-ar",         famille: "Coque arrière", libelle: "Coque arrière",       temps: "coque" },
  { groupe: "Batterie origine",    id: "batterie-origine", famille: "Batterie",      libelle: "Batterie origine",    temps: "batterie" },
  { groupe: "Batterie compatible", id: "batterie-compat",  famille: "Batterie",      libelle: "Batterie compatible", temps: "batterie" },
];

export const PARAMS_V2_DEFAUT = {
  ...PARAMS_DEFAUT, taux: 70, pec: 10,
  tempsDefaut: { ecran: 15, batterie: null, coque: null },
};

export function buildTarifsV2({ v2 = [], params = [], micro = [] }) {
  const anomalies = [];

  // Paramètres (colonnes A/B) + prix fixes (colonnes E:H)
  const p = { ...PARAMS_V2_DEFAUT, tempsDefaut: { ...PARAMS_V2_DEFAUT.tempsDefaut } };
  const vitresRestreintes = new Set();
  for (const r of params) {
    const k = cle(r?.[0]); const v = num(r?.[1]);
    if (k && v != null && !Number.isNaN(v)) {
      if (k.startsWith("taux horaire")) p.taux = v;
      else if (k.includes("prise en charge")) p.pec = v;
      else if (k.startsWith("coefficient")) p.coef = v;
      else if (k === "tva") p.tva = v;
      else if (k.startsWith("arrondi")) p.arrondi = v;
      else if (k.startsWith("decote")) p.decote = v;
      else if (k.startsWith("temps ecran")) p.tempsDefaut.ecran = v;
      else if (k.startsWith("temps batterie")) p.tempsDefaut.batterie = v;
      else if (k.startsWith("temps coque")) p.tempsDefaut.coque = v;
    }
    if (k.includes("vitre") && str(r?.[1]) && Number.isNaN(num(r[1]))) p.magasinsVitre = liste(r[1]);
    if (k.includes("micro") && str(r?.[1]) && Number.isNaN(num(r[1]))) p.magasinsMicro = liste(r[1]);
    // Prix fixes (E:H) : une vitre / coque arrière Apple listée = Pontarlier uniquement.
    const marqueF = cle(r?.[4]), modeleF = cle(r?.[5]), repF = cle(r?.[6]);
    if (marqueF === "apple" && modeleF && (repF.includes("vitre") || repF.includes("coque"))) {
      vitresRestreintes.add(`${marqueF}|${modeleF}`);
    }
  }
  for (const k of ["taux", "pec", "coef", "tva", "arrondi", "decote"]) {
    if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 1000) {
      anomalies.push(`Paramètres : valeur « ${k} » illisible, valeur par défaut utilisée`);
      p[k] = PARAMS_V2_DEFAUT[k];
    }
  }

  // En-têtes : ligne « Marque » + ligne de groupes juste au-dessus (cellules fusionnées
  // → le titre n'est que dans la 1re cellule, on le propage vers la droite).
  const iEnt = v2.findIndex(r => cle(r?.[0]) === "marque");
  if (iEnt < 0) throw new Error("Onglet Tarifs V2 : ligne d'en-tête introuvable (la 1re cellule doit valoir « Marque »)");
  const sous = v2[iEnt].map(cle);
  const grp = [];
  let courant = "";
  const ligneGroupes = iEnt > 0 ? v2[iEnt - 1] : [];
  for (let c = 0; c < sous.length; c++) {
    if (str(ligneGroupes[c])) courant = cle(ligneGroupes[c]);
    grp[c] = courant;
  }
  const col = (nom) => sous.indexOf(cle(nom));
  const colDans = (groupe, nom) => sous.findIndex((s, c) => grp[c] === cle(groupe) && s === cle(nom));
  const iMarque = col("Marque"), iModele = col("Modèle"), iGP = col("GP (€ TTC)"),
    iActif = col("Actif"), iRem = col("Remarque");
  const iTemps = {
    ecran: sous.findIndex(s => s.startsWith("temps ecran")),
    batterie: sous.findIndex(s => s.startsWith("temps batterie")),
    coque: sous.findIndex(s => s.startsWith("temps coque")),
  };
  if (iModele < 0) throw new Error("Onglet Tarifs V2 : colonne « Modèle » introuvable");
  const blocs = GROUPES_V2.map(g => ({
    ...g, iPA: colDans(g.groupe, "PA (€ HT)"), iPrix: colDans(g.groupe, "Prix V2"), iGamme: colDans(g.groupe, "Gamme"),
  })).filter(b => b.iPrix >= 0);
  if (!blocs.length) throw new Error("Onglet Tarifs V2 : aucune colonne « Prix V2 » trouvée");

  const marques = new Map();
  for (const r of v2.slice(iEnt + 1)) {
    const marque = str(r[iMarque]); const modele = str(r[iModele]);
    if (!marque || !modele) continue;
    if (iActif >= 0 && cle(r[iActif]) === "non") continue;
    const ou = `${marque} ${modele}`;

    let gp = iGP >= 0 ? num(r[iGP]) : null;
    if (Number.isNaN(gp) || gp > MONTANT_MAX) { anomalies.push(`${ou} : GP illisible`); gp = null; }

    const reparations = [];
    for (const b of blocs) {
      const prix = num(r[b.iPrix]);
      if (prix == null || prix === 0) continue;
      if (Number.isNaN(prix) || prix < 0 || prix > MONTANT_MAX) {
        anomalies.push(`${ou} — ${b.groupe} : prix V2 illisible (${str(r[b.iPrix])})`); continue;
      }
      const pa = b.iPA >= 0 ? num(r[b.iPA]) : null;
      const base = { id: b.id, famille: b.famille, libelle: b.libelle, gamme: b.iGamme >= 0 ? str(r[b.iGamme]) : "" };
      if (pa == null || Number.isNaN(pa)) {
        // Pas de PA : prix fixe repris de Tarifs_SAVE par le classeur.
        reparations.push({ ...base, source: "fixe", pa: null, temps: null, mo: null, prix, margeHT: null });
        continue;
      }
      let temps = iTemps[b.temps] >= 0 ? num(r[iTemps[b.temps]]) : null;
      if (temps == null || Number.isNaN(temps)) temps = p.tempsDefaut[b.temps];
      const mo = temps != null ? round2((temps + p.pec) * p.taux / 60) : null;
      if (temps == null) anomalies.push(`${ou} — ${b.groupe} : temps de réparation manquant`);
      reparations.push({
        ...base, source: "calcul", pa, temps, mo, prix,
        margeHT: round2(prix / p.tva - pa),
      });
    }
    if (!reparations.length) continue;

    const restreinte = vitresRestreintes.has(`${cle(marque)}|${cle(modele)}`);
    for (const rp of reparations) {
      rp.prixAvecGP = gp ? round2(rp.prix + gp) : null;
      rp.magasins = rp.id === "vitre-ar" && restreinte ? [...p.magasinsVitre] : [];
    }
    if (!marques.has(marque)) marques.set(marque, []);
    marques.get(marque).push({ nom: modele, gp, remarque: iRem >= 0 ? str(r[iRem]) : "", reparations });
  }

  return {
    version: 2,
    params: p,
    marques: [...marques].map(([nom, modeles]) => ({ nom, modeles })),
    microSoudure: lireMicro(micro),
    anomalies,
  };
}

function lireMicro(micro) {
  const out = [];
  const hm = trouverEntete(micro, "Prestation");
  if (!hm) return out;
  const iN = hm.idx("Prestation"), iP = hm.idx("Prix TTC"), iR = hm.idx("Remarque");
  for (const r of micro.slice(hm.ligne + 1)) {
    if (!str(r[iN])) continue;
    const prix = num(r[iP]);
    out.push({ prestation: str(r[iN]), prix: Number.isNaN(prix) ? null : prix, remarque: iR >= 0 ? str(r[iR]) : "" });
  }
  return out;
}

// ─── Lecture du classeur ─────────────────────────────────────────────────────
const lireSansBloquer = (id, plage) => readRange(id, plage).catch(e => {
  console.warn(`Tarifs : lecture ${plage} impossible — ${e.message}`);
  return [];
});

export async function fetchTarifs() {
  const idV2 = process.env.GOOGLE_SHEET_TARIFS_V2_ID;
  const id = process.env.GOOGLE_SHEET_TARIFS_ID;
  if (idV2) {
    // Micro-soudure reste dans Tarifs_SAVE.
    const [v2, params, micro] = await Promise.all([
      readRange(idV2, "'Tarifs V2'!A1:AZ1000"),
      lireSansBloquer(idV2, "'Paramètres'!A1:H300"),
      id ? lireSansBloquer(id, "'Micro-soudure'!A1:C200") : Promise.resolve([]),
    ]);
    return {
      configured: true,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${idV2}/edit`,
      updated: new Date().toISOString(),
      ...buildTarifsV2({ v2, params, micro }),
    };
  }
  if (!id) return { configured: false, marques: [], microSoudure: [], params: PARAMS_DEFAUT, anomalies: [] };
  // Un onglet absent (Prix fixes, Micro-soudure, Paramètres) n'empêche pas la page de s'afficher.
  const lire = (plage) => lireSansBloquer(id, plage);
  const [tarifs, fixes, micro, params] = await Promise.all([
    readRange(id, "'Tarifs'!A1:Z1000"),
    lire("'Prix fixes'!A1:D1000"),
    lire("'Micro-soudure'!A1:C200"),
    lire("'Paramètres'!A1:C50"),
  ]);
  return {
    configured: true,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`,
    updated: new Date().toISOString(),
    ...buildTarifs({ tarifs, fixes, micro, params }),
  };
}

// Un magasin n'a pas besoin des prix d'achat ni des marges.
export function tarifsPourUtilisateur(data, user) {
  if (user?.role === "rz") return data;
  const { anomalies, sheetUrl, ...reste } = data;
  return {
    ...reste,
    marques: data.marques.map(m => ({
      ...m,
      modeles: m.modeles.map(mod => ({
        ...mod,
        reparations: mod.reparations.map(({ pa, mo, temps, margeHT, ...r }) => r),
      })),
    })),
  };
}
