# UpToco

Un outil de gestion visuelle de parc informatique. Dessinez le plan de vos bureaux sur une grille, placez vos machines, surveillez leur état en temps réel et ouvrez des sessions SSH en un clic.

![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![React](https://img.shields.io/badge/react-18-61dafb)

---

## Fonctionnalités

- **Plan d'étage interactif** — dessinez des zones colorées en faisant glisser des rectangles ; les contours sont générés automatiquement
- **Inventaire de machines** — créez vos machines (PC, serveur, laptop, imprimante, switch, routeur…) avec leurs identifiants SSH
- **Glisser-déposer** — faites glisser les machines depuis l'inventaire vers le plan
- **Statut en temps réel** — ping ICMP toutes les 30 secondes avec indicateur vert/rouge par machine, résultats diffusés via WebSocket
- **Connexion SSH** — un clic ouvre un terminal avec les bons identifiants (mot de passe via `sshpass`, clé SSH supportée)
- **Multi-étage** — créez et naviguez entre plusieurs étages, chacun avec son propre plan
- **Annuler / Rétablir** — historique complet pour toutes les actions de dessin
- **Zoom** — de 40 % à 200 %
- **Export PNG** — capture le plan actuel en image
- **Export / Import JSON** — sauvegarde et restauration complète des données

## Stack technique

| Couche    | Technologie                                     |
|-----------|-------------------------------------------------|
| Backend   | Python · FastAPI · aiosqlite (SQLite)           |
| Frontend  | React 18 · TypeScript · Tailwind CSS · Zustand · Vite |

## Prérequis

- Python 3.10+
- Node.js 18+
- `sshpass` (optionnel — requis pour l'authentification SSH par mot de passe)

```bash
sudo apt install sshpass   # Debian / Ubuntu
```

## Installation et lancement

```bash
# Cloner
git clone https://github.com/votre-pseudo/uptoco.git
cd uptoco

# Installer les dépendances Python
pip install -r backend/requirements.txt

# Construire le frontend et démarrer le serveur
chmod +x start.sh
./start.sh
```

L'application est disponible sur **http://localhost:8000**.

> `start.sh` installe les dépendances Node automatiquement au premier lancement, construit le frontend, puis démarre le backend FastAPI qui sert à la fois l'API et le frontend compilé.

## Mode développement

```bash
# Terminal 1 — backend (rechargement à chaud)
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend (serveur de développement Vite avec proxy)
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

## Structure du projet

```
uptoco/
├── backend/
│   ├── main.py          # Application FastAPI (API + WebSocket + fichiers statiques)
│   ├── requirements.txt
│   └── uptoco.db        # Base de données SQLite (créée automatiquement)
├── frontend/
│   ├── src/
│   │   ├── components/  # Grid, Sidebar, TopNav, MachinePopup, modales…
│   │   ├── views/       # InventoryView, PlansView
│   │   ├── store.ts     # État global Zustand
│   │   └── types.ts     # Types TypeScript partagés
│   └── dist/            # Frontend compilé (servi par FastAPI)
└── start.sh             # Script de build et lancement en une commande
```

## Utilisation

1. **Ajouter un étage** — cliquez sur *+ Ajouter* dans la section étage de la barre latérale
2. **Dessiner des zones** — sélectionnez l'outil **▭**, choisissez une couleur, puis cliquez-glissez sur la grille
3. **Effacer** — l'outil **✕** supprime les rectangles et leurs bordures
4. **Ajouter des machines** — allez dans la vue *Inventaire*, renseignez les identifiants SSH, sauvegardez
5. **Placer les machines** — faites glisser une machine depuis la barre latérale vers la grille
6. **Se connecter en SSH** — cliquez sur une machine placée pour ouvrir le popup, puis appuyez sur *Connexion SSH*
7. **Sauvegarder** — utilisez *⬇ Export* dans la barre supérieure pour télécharger une sauvegarde JSON, et *⬆ Import* pour restaurer

## Authentification SSH

| Type         | Prérequis                              |
|--------------|----------------------------------------|
| Mot de passe | `sshpass` doit être installé           |
| Clé SSH      | Chemin absolu vers le fichier `.pem` / clé privée |

## Licence

MIT
