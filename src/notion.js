// ─── notion.js ───────────────────────────────────────────────────────────────
// Lit les pages Notion de suivi et les transforme en JSON structuré pour l'app.
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const STORES = ["Pontarlier", "Lons-le-Saunier", "Dijon", "Besançon", "Chalon-sur-Saône"];

// Objectifs par magasin (mobiles d'occasion)
const OCC_OBJ = { "Pontarlier": 50, "Lons-le-Saunier": 50, "Dijon": 25, "Besançon": 20, "Chalon-sur-Saône": 15 };

// ─── Helpers d'extraction de texte ──────────────────────────────────────────
const richText = (arr) => (arr || []).map(t => t.plain_text).join("");

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
    }
  }
  if (current.heading || current.tables.length || current.paragraphs.length) sections.push(current);
  return sections;
}

// ─── Trouve la section dont le titre contient un mot-clé ────────────────────
const findSection = (sections, ...keywords) =>
  sections.find(s => keywords.some(k => s.heading.toLowerCase().includes(k.toLowerCase())));

// ─── PAGE 1 : Accessoires / GP / Occasion ───────────────────────────────────
function buildPage1(sections) {
  const accessoires = {}, gp = {}, occasion = {};
  const analysis = { accessoires: {}, gp: {} };

  // Accessoires : section avec "accessoires" dans le titre
  const accSec = findSection(sections, "accessoires");
  if (accSec?.tables[0]) {
    for (const row of accSec.tables[0]) {
      const store = matchStore(row[0]);
      if (!store) continue;
      accessoires[store] = {
        margeAcc: parseNum(row[1]),
        margeTotal: parseNum(row[2]),
        ratio: parseNum(row[3]),
        trend: parseTrend(row[4]),
        status: parseStatus(row[5]) || "bad",
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
    for (const row of gpSec.tables[0]) {
      const store = matchStore(row[0]);
      if (!store) continue;
      gp[store] = {
        margeGP: parseNum(row[1]),
        margeTotal: parseNum(row[2]),
        ratio: parseNum(row[3]),
        trend: parseTrend(row[4]),
        status: parseStatus(row[5]) || "bad",
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
    for (const row of occSec.tables[0]) {
      const store = matchStore(row[0]);
      if (!store) continue;
      occasion[store] = {
        volume: parseNum(row[1]),
        marge: parseNum(row[2]),
        objectif: parseNum(row[3]) || OCC_OBJ[store],
        trend: parseTrend(row[5]),
      };
    }
  }

  return { accessoires, gp, occasion, analysis };
}

// ─── PAGE 2 : Mobileo / ATM ─────────────────────────────────────────────────
function buildPage2(sections) {
  const mobileo = {}, atm = {};
  const analysis = { mobileo: {}, atm: {} };

  // Mobileo : tableau par vendeur, on agrège par magasin
  const mobSec = findSection(sections, "mobileo");
  if (mobSec?.tables[0]) {
    for (const row of mobSec.tables[0]) {
      const store = matchStore(row[0]);
      const vendeur = (row[1] || "").trim();
      if (!store) continue;
      // ignore les lignes "total" intermédiaires
      const isTotal = (row[0] || "").toLowerCase().includes("total");
      const total = parseNum(row[row.length - 4]) ?? parseNum(row[5]);
      if (!mobileo[store]) mobileo[store] = { vendeurs: {}, total: 0, objectif: "10-15", trend: 0, status: "bad" };
      if (isTotal) {
        mobileo[store].total = total ?? mobileo[store].total;
        mobileo[store].trend = parseTrend(row[row.length - 2]);
        mobileo[store].status = parseStatus(row[row.length - 1]) || "bad";
      } else if (vendeur && !vendeur.toLowerCase().includes("total")) {
        const v = parseNum(row[5]) ?? 0;
        mobileo[store].vendeurs[vendeur] = v;
        // magasins solo : total = vendeur unique
        if (Object.keys(STORE_STAFF_SOLO).includes(store)) {
          mobileo[store].total = v;
          mobileo[store].trend = parseTrend(row[row.length - 2]);
          mobileo[store].status = parseStatus(row[row.length - 1]) || "bad";
        }
      }
    }
    // recalcul total = somme des vendeurs si pas de ligne total
    for (const store of Object.keys(mobileo)) {
      const sum = Object.values(mobileo[store].vendeurs).reduce((a, b) => a + (b || 0), 0);
      if (!mobileo[store].total) mobileo[store].total = sum;
    }
    for (const p of mobSec.paragraphs) {
      const store = matchStore(p);
      if (store) analysis.mobileo[store] = p.replace(/^[-•\s]+/, "").trim();
    }
  }

  // ATM
  const atmSec = findSection(sections, "atm", "assurance");
  if (atmSec?.tables[0]) {
    for (const row of atmSec.tables[0]) {
      const store = matchStore(row[0]);
      if (!store) continue;
      if ((row[0] || "").toLowerCase().includes("total")) continue;
      atm[store] = {
        total: parseNum(row[4]) ?? 0,
        mobOcc: parseNum(row[5]) ?? 0,
        ratio: parseNum(row[6]) ?? 0,
        trend: parseTrend(row[7]),
        status: parseStatus(row[8]) || "bad",
      };
    }
    for (const p of atmSec.paragraphs) {
      const store = matchStore(p);
      if (store) analysis.atm[store] = p.replace(/^[-•\s]+/, "").trim();
    }
  }

  return { mobileo, atm, analysis };
}

const STORE_STAFF_SOLO = { "Chalon-sur-Saône": 1, "Besançon": 1 };

// ─── Extrait la période depuis le 1er titre "Période : ..." ─────────────────
function extractPeriod(sections) {
  for (const s of sections) {
    const m = s.heading.match(/Période\s*:\s*([^—\n]+?)(?:\s*—\s*à date du\s*(.+))?$/i);
    if (m) return { period: m[1].trim(), updated: (m[2] || "").trim() };
    for (const p of s.paragraphs) {
      const pm = p.match(/Période\s*:\s*([^—\n]+)/i);
      if (pm) return { period: pm[1].trim(), updated: "" };
    }
  }
  return { period: "", updated: "" };
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

  return {
    period: meta.period || "Mois en cours",
    updated: meta.updated || new Date().toLocaleDateString("fr-FR"),
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
  const res = await notion.databases.query({
    database_id: dbId,
    page_size: 50,
    sorts: [{ property: "Date visite", direction: "descending" }],
  });

  return res.results.map(page => {
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
  });
}
