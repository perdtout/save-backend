// ─────────────────────────────────────────────────────────────────────────────
//  src/atm.js — Dossiers ATM (lecture + écriture)
//  Base Notion : 🛡️ Dossiers ATM — Zone SAVE
//  Variable d'environnement : NOTION_ATM_DB_ID = 24f9610b-09af-4a42-b63d-ec4aa23a77d5
//                             (identifiant de la SOURCE DE DONNÉES, comme pour Process)
//
//  Premier module de l'app qui ÉCRIT dans Notion. Trois conséquences :
//   1. l'intégration « SAVE Pilotage » doit être connectée à la base ET disposer
//      des droits d'insertion et de mise à jour de contenu ;
//   2. aucune écriture ne passe par le cache — le cache est invalidé après coup
//      par server.js (voir la route PATCH) ;
//   3. un compte magasin ne peut toucher qu'aux dossiers de son magasin.
//      Le contrôle est fait ici, pas côté front : le front est modifiable.
// ─────────────────────────────────────────────────────────────────────────────

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03"; // ⚠︎ si notion.js utilise 2022-06-28, aligner ici
const DS = () => process.env.NOTION_ATM_DB_ID;

export const STATUTS_OUVERTS = [
  "En expertise",
  "En attente accord",
  "En réparation",
  "Irréparable",
  "Renvoyé ATM",
];

export const ETAPES = [
  "1 - Réception",
  "2 - Cohérence",
  "3 - Expertise et devis",
  "4 - Attente accord ATM",
  "5 - Traitement",
  "6 - Facturation",
  "7 - Clôture Trépidai",
  "8 - Retour et remise",
];

export const MAGASINS = [
  "Pontarlier",
  "Lons-le-Saunier",
  "Dijon",
  "Besançon",
  "Chalon-sur-Saône",
];

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
    const txt = await res.text();
    throw new Error(`Notion ${method} ${path} → ${res.status} ${txt.slice(0, 300)}`);
  }
  return res.json();
}

const txt = (p) => p?.rich_text?.[0]?.plain_text || p?.title?.[0]?.plain_text || "";
const sel = (p) => p?.select?.name || "";
const dat = (p) => p?.date?.start || "";
const num = (p) => (typeof p?.number === "number" ? p.number : null);

const rt = (v) => ({ rich_text: v ? [{ text: { content: String(v).slice(0, 2000) } }] : [] });
const ti = (v) => ({ title: [{ text: { content: String(v || "sans numéro") } }] });
const sl = (v) => ({ select: v ? { name: v } : null });
const dt = (v) => ({ date: v ? { start: v } : null });

function mapDossier(page) {
  const p = page.properties;
  let checks = {};
  let branch = {};
  try {
    const raw = JSON.parse(txt(p["Cases cochées"]) || "{}");
    checks = raw.checks || {};
    branch = raw.branch || {};
  } catch {
    /* champ corrompu : on repart d'une progression vide plutôt que de planter */
  }
  return {
    id: page.id,
    sinistre: txt(p["N° sinistre"]),
    contrat: txt(p["N° contrat"]),
    client: txt(p["Client"]),
    marque: txt(p["Marque"]),
    modele: txt(p["Modèle"]),
    imei: txt(p["IMEI"]),
    typeSinistre: sel(p["Type de sinistre"]),
    magasinAccueil: sel(p["Magasin d'accueil"]),
    magasinReparateur: sel(p["Magasin réparateur"]),
    technicien: txt(p["Technicien"]),
    dateReception: dat(p["Date de réception"]),
    dateEnvoiDevis: dat(p["Date envoi devis"]),
    dateAccord: dat(p["Date accord ATM"]),
    dateRemise: dat(p["Date de remise client"]),
    montant: num(p["Montant devis"]),
    etape: sel(p["Étape en cours"]),
    statut: sel(p["Statut"]),
    remarque: txt(p["Remarque"]),
    majLe: p["Dernière MAJ"]?.last_edited_time || null,
    checks,
    branch,
  };
}

// ─── lecture ─────────────────────────────────────────────────────────────────

/**
 * Dossiers non clôturés. Un compte magasin ne voit que les siens : ceux qu'il
 * répare ET ceux dont il est le magasin d'accueil (le client peut être passé
 * par un Darty rattaché, mais c'est bien lui qui rendra l'appareil).
 */
export async function fetchDossiers({ store } = {}) {
  if (!DS()) return { dossiers: [], configured: false };

  const filter = {
    and: [{ property: "Statut", select: { does_not_equal: "Clôturé" } }],
  };
  if (store) {
    filter.and.push({
      or: [
        { property: "Magasin réparateur", select: { equals: store } },
        { property: "Magasin d'accueil", select: { equals: store } },
      ],
    });
  }

  const out = [];
  let cursor;
  do {
    const page = await notion(`/data_sources/${DS()}/query`, "POST", {
      filter,
      sorts: [{ property: "Date de réception", direction: "ascending" }],
      page_size: 100,
      start_cursor: cursor,
    });
    out.push(...page.results.map(mapDossier));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  return { dossiers: out, configured: true };
}

/** Un dossier précis, avec contrôle d'accès. */
export async function fetchDossier(pageId, { store } = {}) {
  const d = mapDossier(await notion(`/pages/${pageId}`));
  if (store && d.magasinReparateur !== store && d.magasinAccueil !== store) {
    const err = new Error("Ce dossier n'appartient pas à votre magasin.");
    err.status = 403;
    throw err;
  }
  return d;
}

// ─── écriture ────────────────────────────────────────────────────────────────

function valide(b) {
  const e = [];
  if (!b.sinistre) e.push("Le n° de sinistre est obligatoire.");
  if (!b.client) e.push("Le nom du client est obligatoire.");
  if (!MAGASINS.includes(b.magasinReparateur))
    e.push("Magasin réparateur inconnu.");
  if (b.imei && !/^\d{15}$/.test(b.imei))
    e.push("L'IMEI doit comporter 15 chiffres.");
  if (b.typeSinistre && !["Casse", "Oxydation"].includes(b.typeSinistre))
    e.push("Type de sinistre inconnu.");
  return e;
}

/** Ouverture d'un dossier. Le magasin réparateur est imposé pour un compte magasin. */
export async function createDossier(body, { store } = {}) {
  const b = { ...body };
  if (store) b.magasinReparateur = store;

  const erreurs = valide(b);
  if (erreurs.length) {
    const err = new Error(erreurs.join(" "));
    err.status = 400;
    throw err;
  }

  const page = await notion("/pages", "POST", {
    parent: { type: "data_source_id", data_source_id: DS() },
    properties: {
      "N° sinistre": ti(b.sinistre),
      "N° contrat": rt(b.contrat),
      Client: rt(b.client),
      Marque: rt(b.marque),
      Modèle: rt(b.modele),
      IMEI: rt(b.imei),
      "Type de sinistre": sl(b.typeSinistre || "Casse"),
      "Magasin d'accueil": sl(b.magasinAccueil || b.magasinReparateur),
      "Magasin réparateur": sl(b.magasinReparateur),
      Technicien: rt(b.technicien),
      "Date de réception": dt(b.dateReception || new Date().toISOString().slice(0, 10)),
      "Étape en cours": sl(ETAPES[0]),
      Statut: sl("En expertise"),
      "Cases cochées": rt(JSON.stringify({ checks: {}, branch: {} })),
    },
  });
  return mapDossier(page);
}

/**
 * Le statut n'est jamais choisi par le front : il se déduit de l'étape et du
 * chemin pris à l'étape 5. Une seule règle, au même endroit, pour que les
 * compteurs de l'accueil restent justes.
 */
function statutDepuisEtape(etapeIdx, branch) {
  if (etapeIdx >= 4 && branch?.["4"] === "b") return "Irréparable";
  if (etapeIdx <= 2) return "En expertise";
  if (etapeIdx === 3) return "En attente accord";
  return "En réparation";
}

/** Avancement : progression, dates clés, montant, remarque. */
export async function updateDossier(pageId, body, { store } = {}) {
  const actuel = await fetchDossier(pageId, { store });
  if (actuel.statut === "Clôturé") {
    const err = new Error("Ce dossier est clôturé, il n'est plus modifiable.");
    err.status = 409;
    throw err;
  }

  const checks = body.checks ?? actuel.checks;
  const branch = body.branch ?? actuel.branch;
  const etapeIdx = Number.isInteger(body.etapeIdx)
    ? Math.max(0, Math.min(7, body.etapeIdx))
    : ETAPES.indexOf(actuel.etape);

  const props = {
    "Étape en cours": sl(ETAPES[etapeIdx] || ETAPES[0]),
    Statut: sl(body.statut === "Renvoyé ATM" ? "Renvoyé ATM" : statutDepuisEtape(etapeIdx, branch)),
    "Cases cochées": rt(JSON.stringify({ checks, branch })),
  };
  if (body.dateEnvoiDevis !== undefined) props["Date envoi devis"] = dt(body.dateEnvoiDevis);
  if (body.dateAccord !== undefined) props["Date accord ATM"] = dt(body.dateAccord);
  if (body.montant !== undefined) props["Montant devis"] = { number: body.montant ?? null };
  if (body.remarque !== undefined) props["Remarque"] = rt(body.remarque);
  if (body.technicien !== undefined) props["Technicien"] = rt(body.technicien);

  return mapDossier(await notion(`/pages/${pageId}`, "PATCH", { properties: props }));
}

/**
 * Clôture = archivage. On ne supprime rien : la ligne sort de la vue « Dossiers
 * en cours » et bascule dans « Archives clôturées », avec la date de remise.
 * L'attestation de remise peut être réclamée par l'assureur des mois après.
 */
export async function clotureDossier(pageId, body = {}, { store } = {}) {
  await fetchDossier(pageId, { store });
  return mapDossier(
    await notion(`/pages/${pageId}`, "PATCH", {
      properties: {
        Statut: sl("Clôturé"),
        "Étape en cours": sl(ETAPES[7]),
        "Date de remise client": dt(
          body.dateRemise || new Date().toISOString().slice(0, 10)
        ),
      },
    })
  );
}

// ─── indicateurs pour l'accueil ──────────────────────────────────────────────

/** Alimente le bloc « À reprendre » et les compteurs des tuiles. */
export function indicateurs(dossiers, aujourdhui = new Date()) {
  const jours = (d) =>
    d ? Math.round((aujourdhui - new Date(d)) / 86400000) : null;

  const enAttente = dossiers.filter((d) => d.statut === "En attente accord");
  const aRelancer = enAttente.filter((d) => (jours(d.dateEnvoiDevis) ?? 0) > 7);
  const irreparables = dossiers.filter((d) => d.statut === "Irréparable");

  return {
    ouverts: dossiers.length,
    enAttenteAccord: enAttente.length,
    aRelancer: aRelancer.length,
    irreparablesEnStock: irreparables.length,
    detailRelance: aRelancer.map((d) => ({
      id: d.id,
      sinistre: d.sinistre,
      client: d.client,
      magasin: d.magasinReparateur,
      joursSansReponse: jours(d.dateEnvoiDevis),
    })),
  };
}
