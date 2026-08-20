// ─────────────────────────────────────────────────────────────────────────────
// src/alternance.js — Suivi des alternants (lecture + écriture)
//
// Bases Notion, sous 🎓 Alternance — Zone SAVE :
//   NOTION_ALT_ALTERNANTS_ID = f41599e1-ee7f-420a-86df-97db0e2dda53
//   NOTION_ALT_PARCOURS_ID   = fac81575-f8a6-4035-a6ff-735dbc49bf8f
//   NOTION_ALT_HEBDO_ID      = 5182ae53-fdfa-4748-8476-98082367ac4f
// (identifiants de SOURCE DE DONNÉES, comme pour l'ATM et les Process)
//
// Mêmes règles que atm.js : l'intégration « SAVE Pilotage » doit être connectée
// aux trois bases avec droits d'insertion et de mise à jour ; aucune écriture
// ne passe par le cache, server.js l'invalide après coup ; et le contrôle
// d'accès est fait ICI, jamais côté front.
//
// Trois différences, propres à l'alternance :
//   1. Le droit d'écriture ne vient pas du magasin mais du champ `tutorOf` du
//      compte : Jérôme écrit sur Maëlle parce qu'il est SON tuteur.
//   2. Un jalon n'est acquis qu'après validation du RZ. Le tuteur saisit,
//      le RZ tranche.
//   3. L'alternante ne voit jamais les commentaires du tuteur, ni les notes
//      d'un jalon non validé. La coupe est faite au retour, pas à l'affichage.
// ─────────────────────────────────────────────────────────────────────────────

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

const DS_ALT = () => process.env.NOTION_ALT_ALTERNANTS_ID;
const DS_PAR = () => process.env.NOTION_ALT_PARCOURS_ID;
const DS_HEB = () => process.env.NOTION_ALT_HEBDO_ID;

export const TYPES = ["Étape", "Jalon", "Congés", "CFA"];
export const VERDICTS = ["Validé", "À rattraper", "Non validé", "En attente"];

// ─── utilitaires ─────────────────────────────────────────────────────────────

async function notion(path, method = "GET", body) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Notion ${method} ${path} → ${res.status} ${t.slice(0, 300)}`);
  }
  return res.json();
}

const txt = (p) => p?.rich_text?.[0]?.plain_text || p?.title?.[0]?.plain_text || "";
const sel = (p) => p?.select?.name || "";
const sta = (p) => p?.status?.name || "";
const dat = (p) => p?.date?.start || "";
const dend = (p) => p?.date?.end || "";
const num = (p) => (typeof p?.number === "number" ? p.number : null);
const chk = (p) => p?.checkbox === true;
const rel = (p) => (p?.relation || []).map((r) => r.id);

const rt = (v) => ({ rich_text: v ? [{ text: { content: String(v).slice(0, 2000) } }] : [] });
const ti = (v) => ({ title: [{ text: { content: String(v || "sans titre") } }] });
const sl = (v) => ({ select: v ? { name: v } : null });
const st = (v) => ({ status: v ? { name: v } : null });
const dt = (v) => ({ date: v ? { start: v } : null });
const nb = (v) => ({ number: typeof v === "number" ? v : null });
const cb = (v) => ({ checkbox: !!v });

const aujourdhui = () => new Date().toISOString().slice(0, 10);

async function queryAll(ds, body = {}) {
  const out = [];
  let cursor;
  do {
    const page = await notion(`/data_sources/${ds}/query`, "POST", {
      ...body,
      page_size: 100,
      start_cursor: cursor,
    });
    out.push(...page.results);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return out;
}

// ─── mapping ─────────────────────────────────────────────────────────────────

function mapAlternant(page) {
  const p = page.properties;
  return {
    id: page.id,
    nom: txt(p["Alternant"]),
    magasin: sel(p["Magasin"]),
    tuteur: sel(p["Tuteur"]),
    referentAtelier: sel(p["Référent atelier"]),
    statut: sta(p["Statut"]),
    diplome: txt(p["Diplôme préparé"]),
    age: num(p["Âge à l embauche"]),
    contratDebut: dat(p["Contrat"]),
    contratFin: dend(p["Contrat"]),
    finPeriodeEssai: dat(p["Fin période essai"]),
    entreeGoat: dat(p["Entrée GOAT"]),
    rythme: txt(p["Rythme"]),
    semainesMagasin: num(p["Semaines magasin année 1"]),
    semainesCfa: num(p["Semaines CFA année 1"]),
    notesRZ: txt(p["Notes RZ"]),
  };
}

function mapEtape(page) {
  const p = page.properties;
  return {
    id: page.id,
    alternantIds: rel(p["Alternant"]),
    titre: txt(p["Étape"]),
    type: sel(p["Type"]),
    bloc: sel(p["Bloc"]),
    semaine: txt(p["Semaine"]),
    debut: dat(p["Période"]),
    fin: dend(p["Période"]),
    joursMagasin: num(p["Jours magasin"]),
    cumulPresence: num(p["Cumul présence"]),
    attendu: txt(p["Attendu"]),
    statut: sta(p["Statut"]),
    seuil: txt(p["Seuil"]),
    note: txt(p["Note obtenue"]),
    verdict: sel(p["Verdict"]),
    decisionRZ: txt(p["Décision RZ"]),
    commentaireTuteur: txt(p["Commentaire tuteur"]),
    valideRZ: chk(p["Validé par RZ"]),
    saisiPar: txt(p["Saisi par"]),
    saisiLe: dat(p["Saisi le"]),
  };
}

function mapHebdo(page) {
  const p = page.properties;
  return {
    id: page.id,
    alternantIds: rel(p["Alternant"]),
    semaine: txt(p["Semaine"]),
    date: dat(p["Date du point"]),
    bloc: sel(p["Bloc"]),
    accroches: num(p["Accroches posées"]),
    etudes: num(p["Études réalisées"]),
    mobileo: num(p["Mobileo"]),
    occasion: num(p["Occasion"]),
    atm: num(p["ATM"]),
    ratioAcc: num(p["Ratio accessoires %"]),
    ratioGp: num(p["Ratio GP %"]),
    ceQuiAMarche: txt(p["Ce qui a marché"]),
    ceQuiACoince: txt(p["Ce qui a coincé"]),
    engagement: txt(p["Engagement semaine suivante"]),
    objection: txt(p["Objection rencontrée"]),
    commentaireTuteur: txt(p["Commentaire tuteur"]),
    realise: chk(p["Point réalisé"]),
    saisiPar: txt(p["Saisi par"]),
    saisiLe: dat(p["Saisi le"]),
  };
}

// ─── droits ──────────────────────────────────────────────────────────────────

/** Qui a le droit d'ÉCRIRE sur le suivi d'un alternant. */
function peutEcrire(alternant, user) {
  if (!alternant) return false;
  if (user.role === "rz") return true;
  return !!user.tutorOf && user.tutorOf === alternant.nom;
}

/** Qui a le droit de VOIR la fiche d'un alternant. */
function peutVoir(alternant, user) {
  if (user.role === "rz") return true;
  if (user.role === "apprentice") return user.name === alternant.nom;
  return user.store === alternant.magasin;
}

function refus(message, status = 403) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * Ce que l'alternante ne doit pas lire : les commentaires du tuteur, et les
 * notes ou verdicts d'un jalon tant que le RZ ne l'a pas validé. On retire les
 * champs du JSON, on ne se contente pas de les masquer à l'écran.
 */
function pourAlternante(etape) {
  const { commentaireTuteur, ...reste } = etape;
  if (etape.valideRZ) return reste;
  return { ...reste, note: "", verdict: "En attente", decisionRZ: "" };
}

function hebdoPourAlternante(ligne) {
  const { commentaireTuteur, ...reste } = ligne;
  return reste;
}

// ─── lecture ─────────────────────────────────────────────────────────────────

export async function fetchAlternants() {
  if (!DS_ALT()) return { alternants: [], configured: false };
  const pages = await queryAll(DS_ALT());
  return { alternants: pages.map(mapAlternant), configured: true };
}

/**
 * Tout ce dont l'écran a besoin en une requête : la ou les fiches visibles par
 * l'utilisateur, leur parcours et leur suivi hebdomadaire, déjà expurgés.
 */
export async function fetchBundle(user) {
  if (!DS_ALT() || !DS_PAR() || !DS_HEB()) {
    return { configured: false, alternants: [] };
  }

  const { alternants } = await fetchAlternants();
  const visibles = alternants.filter((a) => peutVoir(a, user));
  if (!visibles.length) return { configured: true, alternants: [] };

  const ids = new Set(visibles.map((a) => a.id));
  const [parcoursPages, hebdoPages] = await Promise.all([
    queryAll(DS_PAR(), { sorts: [{ property: "Période", direction: "ascending" }] }),
    queryAll(DS_HEB(), { sorts: [{ property: "Date du point", direction: "descending" }] }),
  ]);

  const parcours = parcoursPages.map(mapEtape).filter((e) => e.alternantIds.some((i) => ids.has(i)));
  const hebdo = hebdoPages.map(mapHebdo).filter((h) => h.alternantIds.some((i) => ids.has(i)));

  return {
    configured: true,
    alternants: visibles.map((a) => {
      const sonParcours = parcours.filter((e) => e.alternantIds.includes(a.id));
      const sonHebdo = hebdo.filter((h) => h.alternantIds.includes(a.id));
      const estAlternante = user.role === "apprentice";
      return {
        ...a,
        peutEcrire: peutEcrire(a, user),
        parcours: estAlternante ? sonParcours.map(pourAlternante) : sonParcours,
        hebdo: estAlternante ? sonHebdo.map(hebdoPourAlternante) : sonHebdo,
        indicateurs: indicateurs(sonParcours, sonHebdo),
      };
    }),
  };
}

async function chargeAlternant(id) {
  const a = mapAlternant(await notion(`/pages/${id}`));
  if (!a.nom) throw refus("Fiche alternant introuvable.", 404);
  return a;
}

/** Retrouve l'alternant rattaché à une ligne de parcours ou de suivi. */
async function alternantDeLaLigne(page) {
  const ids = rel(page.properties["Alternant"]);
  if (!ids.length) throw refus("Cette ligne n'est rattachée à aucun alternant.", 409);
  return chargeAlternant(ids[0]);
}

// ─── écriture — suivi hebdomadaire ───────────────────────────────────────────

// Liste blanche. Tout champ absent d'ici est ignoré en silence : on ne
// renseigne personne sur ce qui existe.
const CHAMPS_HEBDO = {
  accroches:    (v) => ({ "Accroches posées": nb(v) }),
  etudes:       (v) => ({ "Études réalisées": nb(v) }),
  mobileo:      (v) => ({ Mobileo: nb(v) }),
  occasion:     (v) => ({ Occasion: nb(v) }),
  atm:          (v) => ({ ATM: nb(v) }),
  ratioAcc:     (v) => ({ "Ratio accessoires %": nb(v) }),
  ratioGp:      (v) => ({ "Ratio GP %": nb(v) }),
  ceQuiAMarche: (v) => ({ "Ce qui a marché": rt(v) }),
  ceQuiACoince: (v) => ({ "Ce qui a coincé": rt(v) }),
  engagement:   (v) => ({ "Engagement semaine suivante": rt(v) }),
  objection:    (v) => ({ "Objection rencontrée": rt(v) }),
  commentaireTuteur: (v) => ({ "Commentaire tuteur": rt(v) }),
  bloc:         (v) => ({ Bloc: sl(v) }),
  realise:      (v) => ({ "Point réalisé": cb(v) }),
};

function propsDepuis(body, champs) {
  const props = {};
  for (const [cle, construit] of Object.entries(champs)) {
    if (body[cle] !== undefined) Object.assign(props, construit(body[cle]));
  }
  return props;
}

/** Crée la ligne du point du samedi. */
export async function createHebdo(body, user) {
  const alternant = await chargeAlternant(body.alternantId);
  if (!peutEcrire(alternant, user)) {
    throw refus("Seul le tuteur déclaré de cet alternant peut saisir son suivi.");
  }
  if (!body.semaine) throw refus("La semaine est obligatoire (ex. S39).", 400);

  const page = await notion("/pages", "POST", {
    parent: { type: "data_source_id", data_source_id: DS_HEB() },
    properties: {
      Semaine: ti(body.semaine),
      Alternant: { relation: [{ id: alternant.id }] },
      "Date du point": dt(body.date || aujourdhui()),
      "Point réalisé": cb(true),
      "Saisi par": rt(user.name),
      "Saisi le": dt(aujourdhui()),
      ...propsDepuis(body, CHAMPS_HEBDO),
    },
  });
  return mapHebdo(page);
}

export async function updateHebdo(pageId, body, user) {
  const page = await notion(`/pages/${pageId}`);
  const alternant = await alternantDeLaLigne(page);
  if (!peutEcrire(alternant, user)) {
    throw refus("Seul le tuteur déclaré de cet alternant peut corriger son suivi.");
  }
  const props = propsDepuis(body, CHAMPS_HEBDO);
  if (!Object.keys(props).length) throw refus("Aucun champ modifiable fourni.", 400);
  props["Saisi par"] = rt(user.name);
  props["Saisi le"] = dt(aujourdhui());
  return mapHebdo(await notion(`/pages/${pageId}`, "PATCH", { properties: props }));
}

// ─── écriture — jalons ───────────────────────────────────────────────────────

// Ce que le TUTEUR peut renseigner sur un jalon : la note et son commentaire.
// Ni le verdict, ni la décision, ni la validation.
const CHAMPS_JALON_TUTEUR = {
  note:              (v) => ({ "Note obtenue": rt(v) }),
  commentaireTuteur: (v) => ({ "Commentaire tuteur": rt(v) }),
  statut:            (v) => ({ Statut: st(v) }),
};

// Ce que le RZ ajoute au moment de trancher.
const CHAMPS_JALON_RZ = {
  verdict:    (v) => ({ Verdict: sl(VERDICTS.includes(v) ? v : "En attente") }),
  decisionRZ: (v) => ({ "Décision RZ": rt(v) }),
  valideRZ:   (v) => ({ "Validé par RZ": cb(v) }),
};

/** Saisie des notes d'un jalon ou d'une étape par le tuteur. */
export async function updateJalon(pageId, body, user) {
  const page = await notion(`/pages/${pageId}`);
  const alternant = await alternantDeLaLigne(page);
  if (!peutEcrire(alternant, user)) {
    throw refus("Seul le tuteur déclaré de cet alternant peut saisir ses notes.");
  }
  if (chk(page.properties["Validé par RZ"]) && user.role !== "rz") {
    throw refus("Ce jalon est validé, il n'est plus modifiable.", 409);
  }

  const props = propsDepuis(body, CHAMPS_JALON_TUTEUR);
  if (!Object.keys(props).length) throw refus("Aucun champ modifiable fourni.", 400);
  props["Saisi par"] = rt(user.name);
  props["Saisi le"] = dt(aujourdhui());
  return mapEtape(await notion(`/pages/${pageId}`, "PATCH", { properties: props }));
}

/** Verdict et décision. RZ uniquement — le contrôle est aussi fait en amont. */
export async function validerJalon(pageId, body, user) {
  if (user.role !== "rz") throw refus("La validation d'un jalon est réservée au responsable de zone.");
  const props = propsDepuis(body, CHAMPS_JALON_RZ);
  if (!Object.keys(props).length) throw refus("Aucun verdict fourni.", 400);
  if (body.valideRZ === undefined) props["Validé par RZ"] = cb(true);
  props["Statut"] = st("Terminé");
  return mapEtape(await notion(`/pages/${pageId}`, "PATCH", { properties: props }));
}

// ─── indicateurs pour l'écran ────────────────────────────────────────────────

/**
 * Alimente l'en-tête de l'écran : où elle en est, quel est le prochain jalon,
 * et si un point du samedi a été oublié sur une semaine de présence.
 */
export function indicateurs(parcours, hebdo, aujourd = new Date()) {
  const jour = aujourd.toISOString().slice(0, 10);

  const jalons = parcours.filter((e) => e.type === "Jalon");
  const prochainJalon = jalons.find((j) => (j.fin || j.debut) >= jour) || null;

  const enCours =
    parcours.find((e) => e.debut && e.debut <= jour && (e.fin || e.debut) >= jour) || null;

  // Une semaine de présence sans point du samedi saisi.
  const semainesPassees = parcours.filter(
    (e) => e.type === "Étape" && (e.joursMagasin || 0) > 0 && (e.fin || e.debut) < jour
  );
  const semainesSaisies = new Set(hebdo.map((h) => h.semaine));
  const pointsManquants = semainesPassees
    .filter((e) => !semainesSaisies.has(e.semaine))
    .map((e) => ({ semaine: e.semaine, titre: e.titre, fin: e.fin || e.debut }));

  const dernier = hebdo[0] || null;

  return {
    etapeEnCours: enCours ? { titre: enCours.titre, semaine: enCours.semaine, bloc: enCours.bloc, attendu: enCours.attendu } : null,
    prochainJalon: prochainJalon
      ? {
          id: prochainJalon.id,
          titre: prochainJalon.titre,
          date: prochainJalon.fin || prochainJalon.debut,
          seuil: prochainJalon.seuil,
          joursRestants: Math.round((new Date(prochainJalon.fin || prochainJalon.debut) - aujourd) / 86400000),
          presenceALaDate: prochainJalon.cumulPresence,
        }
      : null,
    jalonsValides: jalons.filter((j) => j.valideRZ && j.verdict === "Validé").length,
    jalonsTotal: jalons.length,
    presenceCumulee: [...parcours].reverse().find((e) => e.cumulPresence && (e.fin || e.debut) <= jour)?.cumulPresence ?? 0,
    dernierPoint: dernier ? { semaine: dernier.semaine, date: dernier.date, accroches: dernier.accroches } : null,
    pointsManquants,
  };
}
