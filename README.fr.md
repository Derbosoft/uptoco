# UpToco

Un outil de gestion visuelle de parc informatique. Importez le plan de vos bureaux, placez vos machines dessus, surveillez leur état en temps réel et ouvrez des sessions SSH en un clic.

![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![React](https://img.shields.io/badge/react-18-61dafb)

---

## Fonctionnalités

- **Plan d'étage** — importez n'importe quelle image (PNG, JPG, SVG…) comme fond de plan
- **Inventaire de machines** — créez vos machines (PC, serveur, laptop, imprimante, switch, routeur…) avec leurs identifiants SSH et une couleur personnalisée
- **Glisser-déposer** — faites glisser les machines depuis l'inventaire vers le plan
- **Statut en temps réel** — ping ICMP toutes les 30 s avec indicateur vert/rouge par machine, résultats diffusés via WebSocket
- **Connexion SSH** — un clic ouvre un terminal avec les bons identifiants (mot de passe via `sshpass`, clé SSH supportée)
- **Multi-étage** — créez et naviguez entre plusieurs étages, chacun avec son propre plan
- **Zoom & déplacement** — molette pour zoomer (30 %–400 %, centré sur le curseur), glisser le fond pour naviguer librement
- **Redimensionnement** — faites glisser la poignée ↘ d'une machine pour changer sa taille
- **Export / Import JSON** — sauvegarde et restauration complète des données

## Stack technique

| Couche    | Technologie                                              |
|-----------|----------------------------------------------------------|
| Backend   | Python · FastAPI · aiosqlite (SQLite) · WebSocket        |
| Frontend  | React 18 · TypeScript · Tailwind CSS · Zustand · Vite    |

## Prérequis

- Python 3.10+
- Node.js 18+
- `sshpass` (optionnel — requis pour l'authentification SSH par mot de passe)

```bash
sudo apt install sshpass   # Debian / Ubuntu
```

## Installation et lancement

```bash
curl -sSL https://raw.githubusercontent.com/Derbosoft/uptoco/main/get.sh | bash
bash install.sh
bash start.sh
```

L'application est disponible sur **http://localhost:8000**.

| Script | Rôle |
|--------|------|
| `curl … \| bash` | Clone le dépôt et crée les scripts locaux `install.sh` / `start.sh` |
| `bash install.sh` | Crée le venv Python, installe les dépendances, compile le frontend |
| `bash start.sh` | Corrige les permissions si besoin, recompile le frontend, démarre le backend |

## Mode développement

```bash
# Terminal 1 — backend (rechargement à chaud)
cd backend
../.venv/bin/uvicorn main:app --reload --port 8000

# Terminal 2 — frontend (serveur Vite avec proxy vers :8000)
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

## Structure du projet

```
uptoco/
├── backend/
│   ├── main.py          # App FastAPI — API REST, WebSocket, SSH, fichiers statiques
│   ├── requirements.txt
│   ├── uptoco.db        # Base SQLite (créée automatiquement au premier lancement)
│   └── uploads/         # Images de plans importées
├── frontend/
│   ├── src/
│   │   ├── components/  # FloorCanvas, Sidebar, TopNav, MachineModal, MachinePopup
│   │   ├── views/       # InventoryView, PlansView
│   │   ├── store.ts     # État global Zustand
│   │   └── types.ts     # Types TypeScript partagés
│   └── dist/            # Frontend compilé (servi par FastAPI)
├── get.sh               # Script de téléchargement (clone + création des wrappers)
├── install.sh           # Installation des dépendances + build du frontend
└── start.sh             # Correction permissions + build frontend + démarrage backend
```

## Utilisation

1. **Ajouter un étage** — cliquez sur *+ Ajouter* dans la section étage de la barre latérale
2. **Importer un plan** — glissez une image sur le canvas, ou cliquez *🖼 Changer l'image*
3. **Ajouter des machines** — allez dans la vue *Inventaire*, renseignez les identifiants SSH et la couleur, sauvegardez
4. **Placer les machines** — faites glisser une machine depuis la barre latérale vers le plan
5. **Naviguer** — molette pour zoomer (centré sur le curseur), glisser le fond pour se déplacer
6. **Se connecter en SSH** — cliquez sur une machine placée → *Connexion SSH* dans le popup
7. **Redimensionner une machine** — faites glisser la poignée ↘ en bas à droite de la carte machine
8. **Sauvegarder** — *⬇ Export* télécharge une sauvegarde JSON ; *⬆ Import* la restaure

## Authentification SSH

| Type         | Prérequis                                               |
|--------------|---------------------------------------------------------|
| Mot de passe | `sshpass` installé (`sudo apt install sshpass`)         |
| Clé SSH      | Chemin absolu vers le fichier `.pem` / clé privée       |

## Licence

MIT
