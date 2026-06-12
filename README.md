# API Backend — Pilotage Réseau SAVE (Juvi-Group)

API REST qui lit tes pages Notion de suivi mensuel et sert les données au tableau de bord, avec connexion différenciée RZ / magasins.

## Ce que fait le backend

- Lit tes **2 pages Notion** (Accessoires/GP/Occasion + Mobileo/ATM) et les transforme en JSON propre
- Lit ta **base de visites** Notion
- **Connexion sécurisée** : le RZ voit tout, chaque magasin ne voit que ses propres chiffres et tes commentaires le concernant
- **Cache** intégré pour ne pas surcharger l'API Notion (5 min par défaut)
- Bouton "Actualiser" côté RZ pour forcer une relecture

## Installation (une seule fois)

1. **Installer Node.js** (version 18 ou plus) : https://nodejs.org

2. **Créer une intégration Notion** :
   - Va sur https://www.notion.so/my-integrations
   - Clique "New integration", donne-lui un nom (ex: "SAVE Pilotage")
   - Copie le **Internal Integration Secret** (commence par `ntn_`)
   - Ouvre chacune de tes pages Notion (Page 1, Page 2, base Visites) → menu `•••` → "Connexions" → ajoute ton intégration

3. **Configurer le projet** :
   ```bash
   cd save-backend
   npm install
   cp .env.example .env
   ```
   Puis ouvre `.env` et colle ton token Notion dans `NOTION_TOKEN`. Mets aussi une longue chaîne aléatoire dans `JWT_SECRET`.

4. **Lancer** :
   ```bash
   npm start
   ```
   L'API démarre sur `http://localhost:3001`.

## Vérifier que ça marche

```bash
curl http://localhost:3001/api/health
# → {"ok":true,"service":"SAVE Pilotage API"}
```

Connexion + lecture des résultats :
```bash
# Récupérer un jeton
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"thomas.desternes","password":"rz2024"}'

# Utiliser le jeton renvoyé
curl http://localhost:3001/api/results \
  -H "Authorization: Bearer <le_jeton>"
```

## Endpoints

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/api/health` | public | Vérifie que l'API tourne |
| POST | `/api/login` | public | Connexion, renvoie un jeton |
| GET | `/api/results` | authentifié | Données commerciales (filtrées par rôle) |
| GET | `/api/results?refresh=1` | RZ | Force la relecture Notion |
| GET | `/api/visits` | authentifié | Comptes rendus de visites |
| POST | `/api/refresh` | RZ | Vide le cache |

## Comptes par défaut

À changer dans `src/auth.js` (et idéalement passer en base de données + mots de passe hachés pour la production).

- **RZ** : `thomas.desternes` / `rz2024`
- **Magasins** : `dijon`, `lons`, `pontarlier`, `chalon`, `besancon` (mots de passe dans `auth.js`)

## Brancher le frontend

Le fichier `save-pilotage-backend.jsx` (livré séparément) est la version de l'app qui appelle cette API. Change la constante `API_URL` en haut du fichier pour pointer vers ton serveur (en local : `http://localhost:3001`).

## Mise en ligne (optionnel)

Pour que les magasins y accèdent depuis n'importe où, héberge le backend sur **Railway**, **Render** ou **Fly.io** (tous ont une offre gratuite). Mets tes variables `.env` dans leur interface, et pointe `CORS_ORIGIN` vers l'URL de ton frontend.

## Comment le parser lit Notion

Le module `src/notion.js` :
1. Récupère tous les blocs de chaque page (titres, tableaux, paragraphes)
2. Découpe en sections par titre (Accessoires, GP, Occasion, Mobileo, ATM)
3. Lit chaque tableau ligne par ligne, identifie le magasin, extrait les nombres (gère le format français "1 906 €", "32,3 %")
4. Associe tes commentaires (paragraphes mentionnant un magasin) à chaque magasin

Si tu modifies la **structure** de tes tableaux Notion (ordre des colonnes), il faudra ajuster les index dans `buildPage1` / `buildPage2`. La structure actuelle est calée sur tes pages du 11/06/2026.
