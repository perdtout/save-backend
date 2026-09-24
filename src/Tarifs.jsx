// ═══════════════════════════════════════════════════════════════════════════
// Tarifs réparation — écran « Au comptoir »
//
// Le vendeur choisit la marque, le modèle, puis la réparation (écran origine,
// écran compatible par gamme, vitre arrière, batterie origine ou compatible).
// Les prix viennent du classeur Google Sheets « Tarifs_SAVE » via /api/tarifs :
// le RZ n'y saisit que les prix d'achat, la main d'œuvre et la GP, le serveur
// calcule le prix de vente avec la règle du calculateur.
//
// Vitre arrière et micro-soudure ne se font que dans certains magasins
// (onglet Paramètres du classeur) : on les affiche partout, avec le magasin
// qui les réalise, pour que le vendeur puisse orienter le client.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useCallback } from "react";
import { calculerPack } from "./Calculateur.jsx";

// « Écran compatible » + gamme « Bolt » → « Compatible Bolt » sous l'en-tête ÉCRAN.
const sousTitre = (r) => {
  const reste = r.libelle.replace(r.famille, "").trim();
  const txt = [reste, r.gamme].filter(Boolean).join(" ");
  return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : r.libelle;
};

const euros = (v) =>
  v == null ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const CSS = `
.tar{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:18px;align-items:start}
.tar-marques{display:flex;gap:8px;flex-wrap:wrap}
.tar-marques button{border:1.5px solid var(--line);background:var(--surface);border-radius:10px;padding:9px 16px;
  font:inherit;font-size:14px;font-weight:650;color:var(--ink);cursor:pointer}
.tar-marques button.on{border-color:var(--brand);background:var(--brand-wash);color:var(--brand)}
.tar-cherche{margin-top:14px}
.tar-mods{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin-top:10px;
  max-height:300px;overflow-y:auto;padding:2px}
.tar-mods button{border:1.5px solid var(--line);background:var(--surface);border-radius:9px;padding:8px 10px;
  font:inherit;font-size:13px;text-align:left;color:var(--ink);cursor:pointer}
.tar-mods button:hover{border-color:var(--brand-light)}
.tar-mods button.on{border-color:var(--brand);background:var(--brand-wash);font-weight:650}
.tar-reps{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
.tar-rep{border:1.5px solid var(--line);background:var(--surface);border-radius:12px;padding:12px 14px;
  text-align:left;font:inherit;color:var(--ink);cursor:pointer;position:relative}
.tar-rep:hover{border-color:var(--brand-light)}
.tar-rep.on{border-color:var(--brand);background:var(--brand-wash)}
.tar-rep .fam{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.tar-rep .nom{font-size:14px;font-weight:650;margin:2px 0 8px}
.tar-rep .p{font-size:22px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tar-rep .gp{font-size:12.5px;color:var(--sub);margin-top:2px;font-variant-numeric:tabular-nums}
.tar-rep .ou{display:inline-block;margin-top:8px}
.tar-res{position:sticky;top:120px}
.tar-hero{background:var(--ink);color:#fff;border-radius:var(--r);padding:20px 22px;box-shadow:var(--shadow-lift)}
.tar-hero .lbl{color:var(--brand-light)}
.tar-hero .tel{font-size:13px;color:rgba(255,255,255,.7);margin-top:4px}
.tar-hero .big-price{font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1.05;margin:8px 0 4px;
  font-variant-numeric:tabular-nums}
.tar-hero .line{display:flex;justify-content:space-between;font-size:13px;color:rgba(255,255,255,.75);padding:3px 0;
  font-variant-numeric:tabular-nums}
.tar-hero .line.bonus{color:#8FD6AE}
.tar-hero .lines{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.14)}
.tar-hero .alt{display:flex;justify-content:space-between;align-items:baseline;margin-top:12px;padding-top:12px;
  border-top:1px solid rgba(255,255,255,.14);font-size:13px;color:rgba(255,255,255,.75)}
.tar-hero .alt b{font-size:19px;color:#fff;font-variant-numeric:tabular-nums}
.tar-hero .warn{margin-top:12px;font-size:12.5px;color:var(--brand-light)}
.tar-check{display:flex;gap:10px;align-items:center;margin-top:12px;font-size:13px;cursor:pointer;user-select:none}
.tar-check input{width:17px;height:17px;accent-color:var(--brand);margin:0}
.tar-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.tar-actions .btn{flex:1;justify-content:center}
.tar-vide{color:var(--muted);font-size:13.5px;padding:6px 0}
.tar-ano li{font-size:13px;margin:4px 0}
@media(max-width:860px){.tar{grid-template-columns:1fr}.tar-res{position:static}}
`;

export default function Tarifs({ user, api }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [marque, setMarque] = useState("");
  const [modele, setModele] = useState("");
  const [repId, setRepId] = useState("");
  const [recherche, setRecherche] = useState("");
  const [film, setFilm] = useState(false);
  const [qualirepar, setQualirepar] = useState(false);
  const [copie, setCopie] = useState(false);
  const estRZ = user?.role === "rz";

  const charger = useCallback(async (forcer = false) => {
    setChargement(true); setErreur(null);
    try {
      const d = await api.get(`/api/tarifs${forcer ? "?refresh=1" : ""}`);
      setData(d);
      setMarque(m => m || d.marques?.[0]?.nom || "");
    } catch (e) {
      setErreur(e.message);
    } finally {
      setChargement(false);
    }
  }, [api]);

  useEffect(() => { charger(); }, [charger]);

  const modeles = useMemo(() => {
    const liste = data?.marques?.find(m => m.nom === marque)?.modeles || [];
    const q = recherche.trim().toLowerCase().replace(/\s+/g, "");
    return q ? liste.filter(m => m.nom.toLowerCase().replace(/\s+/g, "").includes(q)) : liste;
  }, [data, marque, recherche]);

  const tel = data?.marques?.find(m => m.nom === marque)?.modeles.find(m => m.nom === modele) || null;
  const rep = tel?.reparations.find(r => r.id === repId) || null;

  const magasinsPour = (r) => (r?.famille === "Vitre arrière" ? data?.params?.magasinsVitre || [] : []);
  const horsMagasin = (r) => {
    const mags = magasinsPour(r);
    return mags.length > 0 && user?.store && !mags.includes(user.store);
  };

  const nomRep = (r) => r ? `${r.libelle}${r.gamme ? ` ${r.gamme}` : ""}` : "";
  const pack = rep ? calculerPack(rep.prix, rep.prixAvecGP ? tel.gp : 0, qualirepar) : null;
  // Le film est une option : on le retire du pack si le vendeur ne le propose pas.
  const totalPack = pack ? pack.pack - (film ? 0 : pack.film) : null;

  const choisirMarque = (m) => { setMarque(m); setModele(""); setRepId(""); setRecherche(""); setCopie(false); };
  const choisirModele = (m) => {
    setModele(m); setCopie(false);
    // On garde la même réparation d'un modèle à l'autre si elle existe.
    const t = data.marques.find(x => x.nom === marque)?.modeles.find(x => x.nom === m);
    if (!t?.reparations.some(r => r.id === repId)) setRepId(t?.reparations[0]?.id || "");
  };

  const texteDevis = () => {
    const l = [`Devis Repair Mobile — ${nomRep(rep)} — ${marque} ${modele}`];
    l.push(`Réparation : ${euros(rep.prix)} TTC`);
    if (rep.prixAvecGP) {
      l.push(`Avec Garantie Plus (${euros(tel.gp)}) : ${euros(rep.prixAvecGP)} TTC`);
      if (film || pack.bonus) l.push(`Pack${film ? " avec film Ocadia" : ""}${pack.bonus ? ", bonus QualiRépar déduit" : ""} : ${euros(totalPack)} TTC`);
    }
    const mags = magasinsPour(rep);
    if (mags.length) l.push(`Réalisée à : ${mags.join(", ")}`);
    return l.join("\n");
  };

  const copier = async () => {
    const txt = texteDevis();
    try { await navigator.clipboard.writeText(txt); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
    }
    setCopie(true);
    setTimeout(() => setCopie(false), 2500);
  };

  if (chargement && !data) {
    return <div className="stack"><style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="card tar-vide">Lecture des tarifs…</div></div>;
  }

  return (
    <div className="stack">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ctx">
        <div>
          <h1 className="h-screen">Tarifs réparation</h1>
          <p>Choisis le téléphone puis la réparation · prix TTC sans et avec Garantie Plus</p>
        </div>
        {estRZ && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data?.sheetUrl && <a className="btn btn-ghost btn-sm" href={data.sheetUrl} target="_blank" rel="noreferrer">Ouvrir le classeur ↗</a>}
            <button className="btn btn-ghost btn-sm" disabled={chargement} onClick={() => charger(true)}>
              {chargement ? "Lecture…" : "Actualiser les prix"}
            </button>
          </div>
        )}
      </div>

      {erreur && (
        <div className="card accent-brand">
          <b>Tarifs indisponibles.</b> <span className="txt-muted">{erreur}</span>
          <div style={{ marginTop: 10 }}><button className="btn btn-ghost btn-sm" onClick={() => charger()}>Réessayer</button></div>
        </div>
      )}

      {data && data.configured === false && (
        <div className="card accent-brand">
          Le classeur des tarifs n'est pas encore branché.
          {estRZ && <span className="txt-muted"> Ajoute la variable GOOGLE_SHEET_TARIFS_ID sur Render (identifiant du Google Sheet Tarifs_SAVE).</span>}
        </div>
      )}

      {estRZ && data?.anomalies?.length > 0 && (
        <div className="card accent-brand">
          <h2 className="h-section">À corriger dans le classeur ({data.anomalies.length})</h2>
          <ul className="tar-ano">{data.anomalies.map((a, i) => <li key={i}>{a}</li>)}</ul>
          <p className="note">Ces lignes ne sont pas affichées aux magasins tant qu'elles ne sont pas corrigées. Décimales : tape une virgule (28,5), jamais un point.</p>
        </div>
      )}

      {data?.marques?.length > 0 && (
        <div className="tar">
          <div className="stack">
            <div className="card">
              <h2 className="h-section">Téléphone</h2>
              <div className="tar-marques">
                {data.marques.map(m => (
                  <button key={m.nom} className={m.nom === marque ? "on" : ""} onClick={() => choisirMarque(m.nom)}>{m.nom}</button>
                ))}
              </div>
              <div className="tar-cherche">
                <label className="field-label" htmlFor="tar-cherche">Modèle</label>
                <input id="tar-cherche" className="input" autoComplete="off" placeholder="Rechercher : 13 pro, A54, Fold…"
                  value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              </div>
              <div className="tar-mods">
                {modeles.map(m => (
                  <button key={m.nom} className={m.nom === modele ? "on" : ""} onClick={() => choisirModele(m.nom)}>{m.nom}</button>
                ))}
                {!modeles.length && <div className="tar-vide">Aucun modèle trouvé.</div>}
              </div>
            </div>

            <div className="card">
              <h2 className="h-section">Réparation{tel ? ` — ${modele}` : ""}</h2>
              {!tel && <div className="tar-vide">Choisis un modèle pour voir les réparations proposées.</div>}
              {tel && (
                <div className="tar-reps">
                  {tel.reparations.map(r => (
                    <button key={r.id} className={`tar-rep${r.id === repId ? " on" : ""}`} onClick={() => { setRepId(r.id); setCopie(false); }}>
                      <div className="fam">{r.famille}</div>
                      <div className="nom">{sousTitre(r)}</div>
                      <div className="p">{euros(r.prix)}</div>
                      <div className="gp">{r.prixAvecGP ? `avec GP : ${euros(r.prixAvecGP)}` : "GP non renseignée"}</div>
                      {magasinsPour(r).length > 0 && (
                        <span className={`chip no-dot ou ${horsMagasin(r) ? "c-warn" : "c-brand"}`}>{magasinsPour(r).join(", ")} uniquement</span>
                      )}
                      {estRZ && (
                        <div className="meta" style={{ marginTop: 6 }}>
                          {r.source === "fixe" ? "Prix fixe (PA à saisir)" : `PA ${euros(r.pa)} · MO ${euros(r.mo)} · marge ${euros(r.margeHT)} HT`}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {tel?.remarque && <p className="note">{tel.remarque}</p>}
            </div>
          </div>

          <div className="tar-res stack">
            <div>
              <div className="tar-hero">
                <div className="lbl">{rep ? nomRep(rep) : "Prix de la réparation"}</div>
                {rep && <div className="tel">{marque} {modele}</div>}
                <div className="big-price">{rep ? euros(rep.prixAvecGP ?? rep.prix) : "—"}</div>
                {rep && <div className="tel">{rep.prixAvecGP ? "avec Garantie Plus" : "Garantie Plus non renseignée pour ce modèle"}</div>}
                {rep && rep.prixAvecGP && (
                  <div className="lines">
                    <div className="line"><span>Réparation</span><span>{euros(rep.prix)}</span></div>
                    <div className="line"><span>Garantie Plus</span><span>{euros(tel.gp)}</span></div>
                    {film && <div className="line"><span>Film Ocadia</span><span>{euros(pack.film)}</span></div>}
                    {pack.bonus > 0 && <div className="line bonus"><span>Bonus QualiRépar</span><span>−{euros(pack.bonus)}</span></div>}
                    {(film || pack.bonus > 0) && <div className="line" style={{ color: "#fff", fontWeight: 700 }}><span>Total pack</span><span>{euros(totalPack)}</span></div>}
                  </div>
                )}
                {rep && (
                  <div className="alt">
                    <span>Sans Garantie Plus</span>
                    <b>{euros(rep.prix)}</b>
                  </div>
                )}
                {rep && horsMagasin(rep) && (
                  <div className="warn">Réparation faite uniquement à {magasinsPour(rep).join(", ")} : oriente le client.</div>
                )}
                {!rep && <div className="warn" style={{ color: "rgba(255,255,255,.55)" }}>Choisis un modèle puis une réparation.</div>}
              </div>
              {rep && rep.prixAvecGP && (
                <div className="card" style={{ marginTop: 12, padding: "12px 16px" }}>
                  <label className="tar-check">
                    <input type="checkbox" checked={film} onChange={(e) => { setFilm(e.target.checked); setCopie(false); }} />
                    <span>Ajouter le film Ocadia ({euros(pack.film)})</span>
                  </label>
                  <label className="tar-check">
                    <input type="checkbox" checked={qualirepar} onChange={(e) => { setQualirepar(e.target.checked); setCopie(false); }} />
                    <span>Bonus QualiRépar (smartphone et panne éligibles)</span>
                  </label>
                </div>
              )}
              <div className="tar-actions">
                <button className="btn btn-primary" disabled={!rep} onClick={copier}>{copie ? "✓ Devis copié" : "Copier le devis"}</button>
              </div>
            </div>

            {data.microSoudure?.length > 0 && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <h2 className="h-section" style={{ margin: 0 }}>Micro-soudure</h2>
                  <span className={`chip no-dot ${user?.store && !(data.params?.magasinsMicro || []).includes(user.store) ? "c-warn" : "c-brand"}`}>
                    {(data.params?.magasinsMicro || []).join(", ")} uniquement
                  </span>
                </div>
                {data.microSoudure.map(m => (
                  <div className="mrow" key={m.prestation}>
                    <span>{m.prestation}{m.remarque && <span className="meta" style={{ display: "block" }}>{m.remarque}</span>}</span>
                    <b>{euros(m.prix)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
