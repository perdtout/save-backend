// ─── notion.js ───────────────────────────────────────────────────────────────
// Lit les pages Notion de suivi et les transforme en JSON structuré pour l'app.
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const NOTION_TOKEN = process.env.NOTION_TOKEN;

// ─── Requête directe sur une base OU une data source ─────────────────────────
// Les bases Notion "nouvelle génération" exposent leurs lignes via l'endpoint
// data_sources (API 2025-09-03). On essaie d'abord databases.query (ancien),
// et si l'objet est introuvable, on bascule sur l'endpoint data_sources.
async function queryCollection(id) {
  const all = [];
  let cursor;

  // Tentative 1 : ancienne API databases.query (pour bases classiques)
  try {
    do {
      const res = await notion.databases.query({ database_id: id, start_cursor: cursor, page_size: 100 });
      all.push(...res.results);
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return all;
  } catch (e) {
    if (e?.code !== "object_not_found") throw e;
    // sinon on bascule sur l'API data sources ci-dessous
  }

  // Tentative 2 : nouvelle API data_sources (REST direct)
  cursor = undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${id}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`data_sources query ${res.status}: ${txt}`);
    }
    const json = await res.json();
    all.push(...(json.results || []));
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return all;
}

const STORES = ["Pontarlier", "Lons-le-Saunier", "Dijon", "Besançon", "Chalon-sur-Saône"];

// Objectifs par magasin (mobiles d'occasion)
const OCC_OBJ = { "Pontarlier": 50, "Lons-le-Saunier": 50, "Dijon": 25, "Besançon": 20, "Chalon-sur-Saône": 15 };

// ─── Helpers d'extraction de texte ──────────────────────────────────────────
const richText = (arr) => (arr || [])
  .map(t => t.plain_text)
  .join("")
  // Certaines listes Notion renvoient ponctuellement le caractère de
  // remplacement Unicode à la place de l'emoji de puce. On conserve la
  // lisibilité du texte sans altérer les chiffres ni les noms.
  .replace(/\uFFFD/g, "•");

// Normalise un nombre français "1 906 €" / "32,3 %" -> 1906 / 32.3
const parseNum = (s) => {
  if (!s) return null;
  const cleaned = String(s).replace(/\s|€|%|\*/g, "").replace(",", ".").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

// Trouve le magasin dans une chaîne (gère accents et variantes)
const matchStore = (text) => {
  const t = (text || "").toLowerCase();
  if (t.includes("chalon")) return "Chalon-sur-Saône";
  if (t.includes("dijon")) return "Dijon";
  if (t.includes("pontarlier")) return "Pontarlier";
  if (t.includes("lons")) return "Lons-le-Saunier";
  if (t.includes("besan")) return "Besançon";
  return null;
};

// Statut depuis l'emoji/texte de la cellule Statut
const parseStatus = (text) => {
  const t = (text || "").toLowerCase();
  if (t.includes("excellent") || t.includes("✅")) return "ok";
  if (t.includes("juste") || t.includes("sous objectif") || t.includes("⚠")) return "warn";
  if (t.includes("faible") || t.includes("volume")) return "low";
  if (t.includes("insuffisant") || t.includes("néant") || t.includes("travailler") || t.includes("🔴")) return "bad";
  if (t.includes("bon") || t.includes("ok")) return "ok";
  return null;
};

// Tendance "📉 -4,9 pts" / "📈 +6 unités" -> -4.9 / 6
const parseTrend = (text) => {
  if (!text) return 0;
  const m = text.match(/([+-]?\d+[.,]?\d*)/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(",", "."));
  return isNaN(n) ? 0 : n;
};

// ─── Récupère tous les blocs d'une page (avec pagination) ───────────────────
async function getAllBlocks(blockId) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

// ─── Récupère les lignes d'un tableau Notion ────────────────────────────────
async function getTableRows(tableBlockId) {
  const rows = await getAllBlocks(tableBlockId);
  return rows
    .filter(r => r.type === "table_row")
    .map(r => r.table_row.cells.map(cell => richText(cell)));
}

// ─── Parse une page : récupère titres de section + tableaux + paragraphes ───
async function parsePage(pageId) {
  const blocks = await getAllBlocks(pageId);
  const sections = []; // { heading, tables: [[...rows]], paragraphs: [...] }
  let current = { heading: "", tables: [], paragraphs: [] };

  for (const b of blocks) {
    if (b.type === "heading_1" || b.type === "heading_2" || b.type === "heading_3") {
      if (current.heading || current.tables.length || current.paragraphs.length) sections.push(current);
      current = { heading: richText(b[b.type].rich_text), tables: [], paragraphs: [] };
    } else if (b.type === "table") {
      const rows = await getTableRows(b.id);
      current.tables.push(rows);
    } else if (b.type === "paragraph") {
      const txt = richText(b.paragraph.rich_text);
      if (txt.trim()) current.paragraphs.push(txt);
    } else if (b.type === "bulleted_list_item") {
      const txt = richText(b.bulleted_list_item.rich_text);
      if (txt.trim()) current.paragraphs.push(txt);
    } else if (b.type === "callout") {
      const txt = richText(b.callout.rich_text);
      if (txt.trim()) current.paragraphs.push(txt);
    } else if (b.type === "quote") {
      const txt = richText(b.quote.rich_text);
      if (txt.trim()) { current.paragraphs.push(txt); current.quotes = current.quotes || []; current.quotes.push(txt); }
    }
  }
  if (current.heading || current.tables.length || current.paragraphs.length) sections.push(current);
  return sections;
}

// ─── Trouve la section dont le titre contient un mot-clé ────────────────────
const findSection = (sections, ...keywords) =>
  sections.find(s => keywords.some(k => s.heading.toLowerCase().includes(k.toLowerCase())));

// Trouve l'index d'une colonne d'après des mots-clés dans la ligne d'en-tête.
// `fallback` maintient la compatibilité avec les anciennes trames sans en-tête.
function colIndex(header, keywords, fallback = -1) {
  for (let i = 0; i < header.length; i++) {
    const h = (header[i] || "").toLowerCase();
    if (keywords.some(k => h.includes(k.toLowerCase()))) return i;
  }
  return fallback;
}

// ─── PAGE 1 : Accessoires / GP / Occasion ───────────────────────────────────
function buildPage1(sections) {
  const accessoires = {}, gp = {}, occasion = {};
  const analysis = { accessoires: {}, gp: {} };

  // Accessoires : section avec "accessoires" dans le titre
  const accSec = findSection(sections, "accessoires");
  if (accSec?.tables[0]) {
    const table = accSec.tables[0];
    const header = table[0] || [];
    const iStore = colIndex(header, ["magasin"], 0);
    const iMarge = colIndex(header, ["marge access"], 1);
    const iTotal = colIndex(header, ["marge totale"], 2);
    const iRatio = colIndex(header, ["ratio"], 3);
    const iTrend = colIndex(header, ["tendance"], 4);
    const iStatus = colIndex(header, ["statut"], 5);
    for (const row of table.slice(1)) {
      const store = matchStore(row[iStore]);
      if (!store) continue;
      accessoires[store] = {
        margeAcc: parseNum(row[iMarge]),
        margeTotal: parseNum(row[iTotal]),
        ratio: parseNum(row[iRatio]),
        trend: parseTrend(row[iTrend]),
        status: parseStatus(row[iStatus]) || "bad",
      };
    }
    // Commentaires : paragraphes mentionnant un magasin
    for (const p of accSec.paragraphs) {
      const store = matchStore(p);
      if (store) analysis.accessoires[store] = p.replace(/^[-•\s]+/, "").trim();
    }
  }

  // GP
  const gpSec = findSection(sections, "garantie", "gp");
  if (gpSec?.tables[0]) {
    const table = gpSec.tables[0];
    const header = table[0] || [];
    const iStore = colIndex(header, ["magasin"], 0);
    const iMarge = colIndex(header, ["marge gp", "garantie"], 1);
    const iTotal = colIndex(header, ["marge totale"], 2);
    const iRatio = colIndex(header, ["ratio"], 3);
    const iTrend = colIndex(header, ["tendance"], 4);
    const iStatus = colIndex(header, ["statut"], 5);
    for (const row of table.slice(1)) {
      const store = matchStore(row[iStore]);
      if (!store) continue;
      gp[store] = {
        margeGP: parseNum(row[iMarge]),
        margeTotal: parseNum(row[iTotal]),
        ratio: parseNum(row[iRatio]),
        trend: parseTrend(row[iTrend]),
        status: parseStatus(row[iStatus]) || "bad",
      };
    }
    for (const p of gpSec.paragraphs) {
      const store = matchStore(p);
      if (store) analysis.gp[store] = p.replace(/^[-•\s]+/, "").trim();
    }
  }

  // Occasion
  const occSec = findSection(sections, "occasion");
  if (occSec?.tables[0]) {
    const table = occSec.tables[0];
    const header = table[0] || [];
    const iStore = colIndex(header, ["magasin"], 0);
    const iVolume = colIndex(header, ["volume"], 1);
    const iMarge = colIndex(header, ["marge"], 2);
    const iObjectif = colIndex(header, ["objectif"], 3);
    const iTrend = colIndex(header, ["tendance"], 5);
    for (const row of table.slice(1)) {
      const store = matchStore(row[iStore]);
      if (!store) continue;
      occasion[store] = {
        volume: parseNum(row[iVolume]),
        marge: parseNum(row[iMarge]),
        objectif: parseNum(row[iObjectif]) || OCC_OBJ[store],
        trend: parseTrend(row[iTrend]),
      };
    }
  }

  return { accessoires, gp, occasion, analysis };
}

// ─── PAGE 2 : Mobileo / ATM ─────────────────────────────────────────────────
// Associe les commentaires (puces "Nom (Magasin — …)") à chaque magasin
function analysisFromBullets(paragraphs) {
  const out = {};
  for (const p of paragraphs) {
    const store = matchStore(p);
    if (!store) continue;
    const clean = p.replace(/^[-•*\s]+/, "").replace(/\*\*/g, "").trim();
    // garde le commentaire le plus complet par magasin
    if (!out[store] || clean.length > out[store].length) out[store] = clean;
  }
  return out;
}

function buildPage2(sections) {
  const mobileo = {}, atm = {};
  const analysis = { mobileo: {}, atm: {} };

  // ─── Mobileo : tableau par vendeur, agrégé par magasin ───
  const mobSec = findSection(sections, "mobileo");
  if (mobSec?.tables[0]) {
    const table = mobSec.tables[0];
    const header = table[0] || [];
    const iTotal = colIndex(header, ["total"]);
    const iTrend = colIndex(header, ["tendance"]);
    const iStatut = colIndex(header, ["statut"]);
    const iVendeur = colIndex(header, ["vendeur"]);

    for (let r = 1; r < table.length; r++) {
      const row = table[r];
      const label = (row[0] || "");
      const store = matchStore(label);
      if (!store) continue;
      const isTotal = label.toLowerCase().includes("total");
      const vendeur = iVendeur >= 0 ? (row[iVendeur] || "").trim() : "";
      const totalVal = iTotal >= 0 ? parseNum(row[iTotal]) : null;

      if (!mobileo[store]) mobileo[store] = { vendeurs: {}, total: 0, objectif: "10-15", trend: 0, status: "bad" };

      if (isTotal) {
        if (totalVal != null) mobileo[store].total = totalVal;
        if (iTrend >= 0) mobileo[store].trend = parseTrend(row[iTrend]);
        if (iStatut >= 0) mobileo[store].status = parseStatus(row[iStatut]) || "bad";
      } else if (vendeur && !vendeur.toLowerCase().includes("total")) {
        if (totalVal != null) mobileo[store].vendeurs[vendeur] = totalVal;
        // magasins solo : la ligne vendeur porte le total du magasin
        if (STORE_STAFF_SOLO[store]) {
          if (totalVal != null) mobileo[store].total = totalVal;
          if (iTrend >= 0) mobileo[store].trend = parseTrend(row[iTrend]);
          if (iStatut >= 0) mobileo[store].status = parseStatus(row[iStatut]) || "bad";
        }
      }
    }
    // total = somme des vendeurs si pas de ligne "total" explicite
    for (const store of Object.keys(mobileo)) {
      const sum = Object.values(mobileo[store].vendeurs).reduce((a, b) => a + (b || 0), 0);
      if (!mobileo[store].total && sum) mobileo[store].total = sum;
    }
    analysis.mobileo = analysisFromBullets(mobSec.paragraphs);
  }

  // ─── ATM : détection des colonnes par en-tête ───
  const atmSec = findSection(sections, "atm", "assurance");
  if (atmSec?.tables[0]) {
    const table = atmSec.tables[0];
    const header = table[0] || [];
    const iAtm = colIndex(header, ["total atm", "atm vendus", "atm"]);
    const iOcc = colIndex(header, ["occ"]);
    const iRatio = colIndex(header, ["ratio"]);
    const iTrend = colIndex(header, ["tendance"]);
    const iStatut = colIndex(header, ["statut"]);

    for (let r = 1; r < table.length; r++) {
      const row = table[r];
      const label = (row[0] || "");
      const store = matchStore(label);
      if (!store) continue;
      if (label.toLowerCase().includes("total")) continue;
      atm[store] = {
        total: (iAtm >= 0 ? parseNum(row[iAtm]) : null) ?? 0,
        mobOcc: (iOcc >= 0 ? parseNum(row[iOcc]) : null) ?? 0,
        ratio: (iRatio >= 0 ? parseNum(row[iRatio]) : null) ?? 0,
        trend: iTrend >= 0 ? parseTrend(row[iTrend]) : 0,
        status: (iStatut >= 0 ? parseStatus(row[iStatut]) : null) || "bad",
      };
    }
    analysis.atm = analysisFromBullets(atmSec.paragraphs);
  }

  return { mobileo, atm, analysis };
}

const STORE_STAFF_SOLO = { "Chalon-sur-Saône": 1, "Besançon": 1 };

// ─── Extrait la période depuis le 1er titre "Période : ..." ─────────────────
function extractPeriod(sections) {
  for (const s of sections) {
    const m = s.heading.match(
      /Période\s*:\s*([^—\n]+?)(?:\s*—\s*(?:cumul\s+au|à date du)\s*(\d{1,2}\/\d{1,2}\/\d{4})(?:\s*\(\s*(\d+)\s*\/\s*(\d+)\s*jours?\s+ouvrés?\s*\))?)?$/i
    );
    if (m) {
      return {
        period: m[1].trim(),
        updated: (m[2] || "").trim(),
        workdays: m[3] && m[4] ? { elapsed: Number(m[3]), total: Number(m[4]) } : null,
      };
    }
    for (const p of s.paragraphs) {
      const pm = p.match(/Période\s*:\s*([^—\n]+)/i);
      if (pm) return { period: pm[1].trim(), updated: "", workdays: null };
    }
  }
  return { period: "", updated: "", workdays: null };
}

// ─── Extrait la phrase de synthèse RZ (fait marquant / ce que je retiens) ────
// Cherche la SECTION dont le titre évoque le fait marquant, et renvoie son texte.
// Tolère plusieurs intitulés et fonctionne sur les deux pages.
function extractSynthese(sections) {
  const TITLE_RE = /fait marquant|ce que je retiens|à retenir|synthèse de la journée|en résumé/i;

  // 1) Section dédiée : on prend ses paragraphes/citations comme contenu
  for (const s of sections) {
    if (TITLE_RE.test(s.heading || "")) {
      const body = [...(s.paragraphs || []), ...(s.quotes || [])]
        .map(t => t.replace(/^[>🎉💡⭐✨\s]+/, "").trim())
        .filter(Boolean)
        .join("\n");
      if (body) return body;
    }
  }

  // 2) Sinon : un paragraphe/citation qui contient l'intitulé en ligne
  let candidate = "";
  for (const s of sections) {
    for (const p of [...(s.quotes || []), ...s.paragraphs]) {
      if (TITLE_RE.test(p)) candidate = p;
    }
  }
  if (candidate) {
    return candidate.replace(/^[>🎉💡⭐✨\s]+/, "").replace(/^(fait marquant|ce que je retiens[^:]*)\s*:?\s*/i, "").trim();
  }

  // 3) Dernier recours : dernière citation de la page
  let lastQuote = "";
  for (const s of sections) {
    if (s.quotes && s.quotes.length) lastQuote = s.quotes[s.quotes.length - 1];
  }
  return lastQuote.replace(/^[>🎉💡⭐✨\s]+/, "").trim();
}

// ─── API publique du module ─────────────────────────────────────────────────
export async function fetchResultsData() {
  const [sec1, sec2] = await Promise.all([
    parsePage(process.env.NOTION_PAGE1_ID),
    parsePage(process.env.NOTION_PAGE2_ID),
  ]);

  const meta = extractPeriod(sec1);
  const page1 = buildPage1(sec1);
  const page2 = buildPage2(sec2);

  // Fait marquant : on prend celui de la Page 1 en priorité, sinon Page 2
  const synthese1 = extractSynthese(sec1);
  const synthese2 = extractSynthese(sec2);
  const syntheseRZ = synthese1 || synthese2;
  // Les deux faits marquants, si tu en mets un différent par page
  const faitsMarquants = [synthese1, synthese2].filter(Boolean);

  return {
    period: meta.period || "Mois en cours",
    updated: meta.updated || new Date().toLocaleDateString("fr-FR"),
    workdays: meta.workdays,
    syntheseRZ,
    faitsMarquants,
    page1,
    page2,
  };
}

// ─── Visites : lit la base de données ───────────────────────────────────────
// Colonnes réelles de la base "Suivi Visites Magasins SAVE" :
//   Titre visite (title), Magasin (select), Date visite (date),
//   Statut visite (select: Planifiée / Réalisée / Compte-rendu envoyé),
//   Responsable présent (select), Technicien(s) présent(s) (multi_select),
//   Points positifs, Points à corriger, Actions décidées, Observations libres,
//   Objectifs fixés, Objectifs de la visite précédente (text),
//   Objectifs atteints ? (select), Prochain RDV (date).
export async function fetchVisits() {
  const dbId = process.env.NOTION_VISITS_DB_ID;
  const results = await queryCollection(dbId);

  return results.map(page => {
    const props = page.properties;

    const getTitle = () => {
      const tp = Object.values(props).find(p => p.type === "title");
      return tp ? richText(tp.title) : "";
    };
    const getProp = (names, type) => {
      for (const name of names) {
        const p = props[name];
        if (!p) continue;
        if (type === "date") return p.date?.start || "";
        if (type === "select") return p.select?.name || "";
        if (type === "multi_select") return (p.multi_select || []).map(o => o.name);
        if (type === "rich_text") return richText(p.rich_text);
      }
      return type === "multi_select" ? [] : "";
    };

    const statut = getProp(["Statut visite", "Statut"], "select");
    // "Compte-rendu envoyé" = visite publiée et visible par le magasin
    const published = statut === "Compte-rendu envoyé";

    const techniciens = getProp(["Technicien(s) présent(s)"], "multi_select");
    const responsable = getProp(["Responsable présent"], "select");
    const staff = [responsable, ...techniciens].filter(Boolean).filter(s => s !== "Seul en magasin");

    return {
      id: page.id,
      title: getTitle(),
      store: getProp(["Magasin", "Store"], "select") || matchStore(getTitle()),
      date: getProp(["Date visite", "Date", "Date de visite"], "date"),
      statut,                       // statut brut (Planifiée / Réalisée / Compte-rendu envoyé)
      published,                    // vrai si compte-rendu envoyé
      staff,                        // responsable + techniciens présents
      objectifsAtteints: getProp(["Objectifs atteints ?"], "select"),
      pointsPositifs: getProp(["Points positifs"], "rich_text"),
      pointsACorriger: getProp(["Points à corriger"], "rich_text"),
      actions: getProp(["Actions décidées"], "rich_text"),
      observations: getProp(["Observations libres"], "rich_text"),
      objectifsFixes: getProp(["Objectifs fixés"], "rich_text"),
      prochainRdv: getProp(["Prochain RDV"], "date"),
      url: page.url,
    };
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// ─── Historique mensuel : lit la base d'archivage ───────────────────────────
// Base "Historique Mensuel SAVE". Chaque ligne = un magasin sur un mois donné.
export async function fetchHistory() {
  const dsId = process.env.NOTION_HISTORY_DB_ID;
  if (!dsId) return { months: [], byStore: {} };

  const all = await queryCollection(dsId);

  const num = (p) => (p?.number ?? null);
  const txt = (p) => richText(p?.rich_text || []);
  const sel = (p) => p?.select?.name || "";

  const rows = all.map(page => {
    const pr = page.properties;
    return {
      mois: txt(pr["Mois"]),
      magasin: sel(pr["Magasin"]),
      accessoires: num(pr["Ratio Accessoires"]),
      margeAccessoires: num(pr["Marge Accessoires"]),
      gp: num(pr["Ratio GP"]),
      margeGP: num(pr["Marge GP"]),
      occasion: num(pr["Mobiles Occasion"]),
      objectifOccasion: num(pr["Objectif Occasion"]),
      mobileo: num(pr["Forfaits Mobileo"]),
      atm: num(pr["Ratio ATM"]),
      margeTotale: num(pr["Marge Totale"]),
      synthese: txt(pr["Synthèse du mois"]),
    };
  }).filter(r => r.mois && r.magasin);

  // Liste triée des mois présents
  const months = [...new Set(rows.map(r => r.mois))].sort();

  // Regroupé par magasin, chaque magasin -> liste de mois triés
  const byStore = {};
  for (const r of rows) {
    if (!byStore[r.magasin]) byStore[r.magasin] = [];
    byStore[r.magasin].push(r);
  }
  for (const s of Object.keys(byStore)) {
    byStore[s].sort((a, b) => a.mois.localeCompare(b.mois));
  }

  return { months, byStore, rows };
}

// ─── GOAT : lit la base "🐐 GOAT — Performance Vendeurs" ────────────────────
// Une ligne = un vendeur sur une période (Type période = "Semaine" ou "Mois").
// Colonnes brutes : Vendeur (title), Magasin (select), Type période (select),
//   Période (rich_text), Date début (date), Solo (checkbox),
//   Ratio Accessoires % / Ratio GP % / Contrats Mobileo / Objectif Mobileo
//   individuel / ATM vendus / Mobiles Occasion vendus / Prime ATM € (mois
//   historique) (number), MVP attribué (checkbox), Notes (rich_text).
// Colonnes calculées (formula, lues via property.formula.number) :
//   Score Accessoires / Score GP / Score Mobileo / Ratio ATM % /
//   Score ATM (calculé) / Score brut / Score final.

const goatGetTitle = (props) => {
  const tp = Object.values(props).find(p => p.type === "title");
  return tp ? richText(tp.title) : "";
};

const goatGetProp = (props, names, type) => {
  for (const name of names) {
    const p = props[name];
    if (!p) continue;
    if (type === "select") return p.select?.name || "";
    if (type === "checkbox") return !!p.checkbox;
    if (type === "number") return p.number ?? null;
    if (type === "formula_number") return p.formula?.number ?? null;
    if (type === "rich_text") return richText(p.rich_text);
    if (type === "date") return p.date?.start || "";
  }
  return null;
};

function parseGoatRow(page) {
  const props = page.properties;
  const breakdown = {
    accessoires: goatGetProp(props, ["Score Accessoires"], "formula_number") ?? 0,
    gp:          goatGetProp(props, ["Score GP"], "formula_number") ?? 0,
    mobileo:     goatGetProp(props, ["Score Mobileo"], "formula_number") ?? 0,
    atm:         goatGetProp(props, ["Score ATM (calculé)"], "formula_number") ?? 0,
  };
  return {
    name:        goatGetTitle(props),
    store:       goatGetProp(props, ["Magasin"], "select"),
    periodType:  goatGetProp(props, ["Type période"], "select"), // "Semaine" | "Mois"
    periodLabel: goatGetProp(props, ["Période"], "rich_text"),
    periodStart: goatGetProp(props, ["Date début"], "date"),
    isSolo:      goatGetProp(props, ["Solo"], "checkbox"),
    mvp:         goatGetProp(props, ["MVP attribué"], "checkbox"),
    total:       goatGetProp(props, ["Score final"], "formula_number") ?? 0,
    breakdown,
  };
}

// Regroupe les lignes par période (label) et renvoie [{ label, start, scores: [...] }, ...]
// triées de la plus récente à la plus ancienne (par Date début).
function groupGoatByPeriod(rows) {
  const byLabel = {};
  for (const r of rows) {
    if (!r.periodLabel) continue;
    if (!byLabel[r.periodLabel]) byLabel[r.periodLabel] = { label: r.periodLabel, start: r.periodStart, scores: [] };
    byLabel[r.periodLabel].scores.push({
      name: r.name, store: r.store, total: r.total, isSolo: r.isSolo, breakdown: r.breakdown,
    });
  }
  return Object.values(byLabel).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
}

function buildGoatData(pages) {
  const rows = pages.map(parseGoatRow).filter(r => r.name && r.periodType);

  const weeklyRows = rows.filter(r => r.periodType === "Semaine");
  const monthlyRows = rows.filter(r => r.periodType === "Mois");

  const weeklyPeriods = groupGoatByPeriod(weeklyRows);
  const monthlyPeriods = groupGoatByPeriod(monthlyRows);

  const weekly = weeklyPeriods[0]
    ? { label: weeklyPeriods[0].label, scores: weeklyPeriods[0].scores.sort((a, b) => b.total - a.total) }
    : null;
  const monthly = monthlyPeriods[0]
    ? { label: monthlyPeriods[0].label, scores: monthlyPeriods[0].scores.sort((a, b) => b.total - a.total) }
    : null;

  // Historique des titres : une entrée par ligne où MVP attribué est coché,
  // triée de la plus récente à la plus ancienne. Les égalités (co-MVP) sur
  // une même Période apparaissent comme deux entrées séparées, naturellement.
  // La date de début est indispensable côté app : c'est elle qui rattache
  // chaque titre à sa saison (juin → mai de l'année suivante).
  const titlesHistory = rows
    .filter(r => r.mvp)
    .sort((a, b) => (b.periodStart || "").localeCompare(a.periodStart || ""))
    .map(r => ({
      type: r.periodType === "Semaine" ? "week" : "month",
      label: r.periodLabel,
      winner: r.name,
      store: r.store,
      score: r.total,
      start: r.periodStart || "",
    }));

  return { weekly, monthly, titlesHistory };
}

export async function fetchGoatData() {
  const dsId = process.env.NOTION_GOAT_DB_ID;
  if (!dsId) return { weekly: null, monthly: null, titlesHistory: [] };
  return buildGoatData(await queryCollection(dsId));
}

// ─── VENDEURS : cumul du mois en cours ──────────────────────────────────────
// Aucune ligne "Mois" n'existe tant que le mois n'est pas terminé : on agrège
// donc les lignes "Jour" du mois courant. Bonus : le résultat est à jour au
// jour près, et les colonnes mal remplies au niveau mensuel (mobiles occasion)
// sont couvertes par le détail journalier.
const VENDOR_ROLES = {
  "Mathis": "Responsable", "Narcisse": "Technicien",
  "Jérôme": "Responsable", "Nassim": "Technicien",
  "Jules": "Responsable", "Bilhal": "Technicien",
  "Jean-Baptiste": "Seul en magasin", "Samy": "Seul en magasin",
};

const num = (p) => (p?.number ?? null);

function moisCourantISO(ref = new Date()) {
  const y = ref.getFullYear(), m = String(ref.getMonth() + 1).padStart(2, "0");
  return { debut: `${y}-${m}-01`, cle: `${y}-${m}` };
}

function buildVendorsMTD(pages) {
  const { debut, cle } = moisCourantISO();

  const agg = {};
  for (const page of pages) {
    const pr = page.properties;
    const type = pr["Type période"]?.select?.name;
    if (type !== "Jour") continue;
    const jour = pr["Date début"]?.date?.start || "";
    if (!jour || jour < debut) continue;

    const nom = richText(Object.values(pr).find(p => p.type === "title")?.title || []);
    if (!nom) continue;
    const magasin = pr["Magasin"]?.select?.name || "";
    const k = `${magasin}::${nom}`;
    if (!agg[k]) {
      agg[k] = {
        name: nom, store: magasin, role: VENDOR_ROLES[nom] || "",
        margeTotale: 0, margeAccessoires: 0, margeGP: 0,
        mobileo: 0, atm: 0, occasion: 0, jours: 0, dernierJour: "",
      };
    }
    const a = agg[k];
    const marge = num(pr["Marge Totale €"]) || 0;
    a.margeTotale       += marge;
    a.margeAccessoires  += num(pr["Marge Accessoires €"]) || 0;
    a.margeGP           += num(pr["Marge GP €"]) || 0;
    a.mobileo           += num(pr["Contrats Mobileo"]) || 0;
    a.atm               += num(pr["ATM vendus"]) || 0;
    a.occasion          += num(pr["Mobiles Occasion vendus"]) || 0;
    if (marge > 0) a.jours += 1;
    if (jour > a.dernierJour) a.dernierJour = jour;
  }

  const vendors = Object.values(agg).map(v => ({
    ...v,
    margeTotale: Math.round(v.margeTotale),
    margeAccessoires: Math.round(v.margeAccessoires),
    margeGP: Math.round(v.margeGP),
    ratioAccessoires: v.margeTotale > 0 ? +((v.margeAccessoires / v.margeTotale) * 100).toFixed(1) : null,
    ratioGP:          v.margeTotale > 0 ? +((v.margeGP / v.margeTotale) * 100).toFixed(1) : null,
    ratioATM:         v.occasion > 0 ? +((v.atm / v.occasion) * 100).toFixed(1) : null,
  })).sort((a, b) => b.margeTotale - a.margeTotale);

  return { periode: cle, vendors };
}

export async function fetchVendorsMTD() {
  const dsId = process.env.NOTION_GOAT_DB_ID;
  if (!dsId) return { periode: null, vendors: [] };
  return buildVendorsMTD(await queryCollection(dsId));
}

// Le classement GOAT et le cumul vendeurs reposent sur la même base. Cette
// fonction permet au serveur de ne lire la collection qu'une seule fois lors
// d'un chargement ou d'une actualisation.
export async function fetchGoatBundle() {
  const dsId = process.env.NOTION_GOAT_DB_ID;
  if (!dsId) {
    return {
      goat: { weekly: null, monthly: null, titlesHistory: [] },
      vendors: { periode: null, vendors: [] },
    };
  }
  const pages = await queryCollection(dsId);
  return { goat: buildGoatData(pages), vendors: buildVendorsMTD(pages) };
}

// ─── PLANS D'ACTION MAGASINS ────────────────────────────────────────────────
// Base "🎯 Plans d'action magasins — Zone SAVE". Une ligne = une action.
// La case "Publié" commande la visibilité côté magasin, comme pour les visites.
export async function fetchActions() {
  const dsId = process.env.NOTION_ACTIONS_DB_ID;
  if (!dsId) return [];

  const pages = await queryCollection(dsId);
  const ORDRE = { "À faire": 0, "En cours": 1, "Fait": 2 };

  return pages.map(page => {
    const pr = page.properties;
    return {
      id: page.id,
      title: richText(Object.values(pr).find(p => p.type === "title")?.title || []),
      store: pr["Magasin"]?.select?.name || "",
      who: pr["Concerne"]?.select?.name || "",
      indicator: pr["Indicateur"]?.select?.name || "",
      state: pr["État"]?.select?.name || "À faire",
      due: pr["Échéance"]?.date?.start || "",
      month: richText(pr["Mois"]?.rich_text || []),
      origin: pr["Origine"]?.select?.name || "",
      published: !!pr["Publié"]?.checkbox,
      notes: richText(pr["Notes"]?.rich_text || []),
      url: page.url,
    };
  })
  .filter(a => a.title && a.store)
  .sort((a, b) =>
    (ORDRE[a.state] ?? 0) - (ORDRE[b.state] ?? 0) ||
    (a.due || "9999").localeCompare(b.due || "9999"));
}


// ─── PROCESS — bibliothèque des process de la zone ───────────────────────────
// Base Notion « 📁 Process — Zone SAVE ». Les fichiers restent dans le Drive :
// cette base ne porte que les métadonnées et décide de ce qui s'affiche.
// Une ligne non publiée reste invisible côté magasin.
export async function fetchProcess() {
  const dsId = process.env.NOTION_PROCESS_DB_ID;
  if (!dsId) return [];

  const pages = await queryCollection(dsId);
  const ORDRE_THEME = {
    "Réparation & atelier": 0,
    "Occasion & reprise": 1,
    "Brokers": 2,
    "Ventes & partenaires": 3,
    "SAV & administratif": 4,
  };

  return pages.map(page => {
    const pr = page.properties;
    return {
      id: page.id,
      title: richText(Object.values(pr).find(p => p.type === "title")?.title || []),
      theme: pr["Thème"]?.select?.name || "Autres",
      url: pr["Lien Drive"]?.url || "",
      format: pr["Format"]?.select?.name || "PDF",
      // Date lue dans le document lui-même, pas la date de modification Drive.
      updated: pr["Date MAJ"]?.date?.start || "",
      state: pr["État"]?.select?.name || "",
      audience: pr["Pour qui"]?.select?.name || "Tous",
      published: !!pr["Publié"]?.checkbox,
      note: richText(pr["Remarque"]?.rich_text || []),
      notionUrl: page.url,
    };
  })
  .filter(p => p.title)
  .sort((a, b) =>
    (ORDRE_THEME[a.theme] ?? 9) - (ORDRE_THEME[b.theme] ?? 9) ||
    (b.updated || "").localeCompare(a.updated || "") ||
    a.title.localeCompare(b.title, "fr"));
}
