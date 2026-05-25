# UpToco

A visual computer park management tool. Draw your office floor plan on a grid, place machines, monitor their online/offline status in real time, and open SSH sessions in one click.

![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![React](https://img.shields.io/badge/react-18-61dafb)

---

## Features

- **Interactive floor plan** — draw colored zones by dragging rectangles; borders are generated automatically
- **Machine inventory** — create machines (PC, server, laptop, printer, switch, router…) with their SSH credentials
- **Drag & drop** — drag machines from the inventory onto the floor plan
- **Real-time status** — ICMP ping every 30 seconds with green/red indicator per machine; results broadcast via WebSocket
- **SSH connection** — one click (or left-click popup) opens a terminal with the correct credentials (password via `sshpass`, key file supported)
- **Multi-floor** — create and switch between floors, each with its own plan
- **Undo / Redo** — full history for all drawing actions
- **Zoom** — from 40 % to 200 %
- **Export PNG** — capture the current floor plan as an image
- **Export / Import JSON** — full backup and restore of all data

## Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Backend  | Python · FastAPI · aiosqlite (SQLite)   |
| Frontend | React 18 · TypeScript · Tailwind CSS · Zustand · Vite |

## Requirements

- Python 3.10+
- Node.js 18+
- `sshpass` (optional — required for password-based SSH auth)

```bash
sudo apt install sshpass   # Debian / Ubuntu
```

## Installation & run

```bash
# Clone
git clone https://github.com/your-username/uptoco.git
cd uptoco

# Install Python dependencies
pip install -r backend/requirements.txt

# Build frontend + start server
chmod +x start.sh
./start.sh
```

The app is available at **http://localhost:8000**.

> `start.sh` installs Node dependencies automatically on first run, builds the frontend, then starts the FastAPI backend which serves both the API and the built frontend.

## Development mode

```bash
# Terminal 1 — backend (hot-reload)
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend (Vite dev server with proxy)
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

## Project structure

```
uptoco/
├── backend/
│   ├── main.py          # FastAPI app (API + WebSocket + static serving)
│   ├── requirements.txt
│   └── uptoco.db        # SQLite database (auto-created)
├── frontend/
│   ├── src/
│   │   ├── components/  # Grid, Sidebar, TopNav, MachinePopup, modals…
│   │   ├── views/       # InventoryView, PlansView
│   │   ├── store.ts     # Zustand global state
│   │   └── types.ts     # Shared TypeScript types
│   └── dist/            # Built frontend (served by FastAPI)
└── start.sh             # One-command build & run script
```

## Usage

1. **Add a floor** — click *+ Ajouter* in the floor section of the sidebar
2. **Draw zones** — select the **▭** rectangle tool, choose a color, then click-drag on the grid
3. **Erase** — the **✕** eraser removes rectangles and their borders
4. **Add machines** — go to the *Inventaire* view, fill in SSH credentials, save
5. **Place machines** — drag a machine from the sidebar onto the grid
6. **Connect via SSH** — click a placed machine to open the popup, then press *Connexion SSH*
7. **Backup** — use *⬇ Export* in the top bar to download a JSON backup, and *⬆ Import* to restore

## SSH authentication

| Type     | Requirement                    |
|----------|-------------------------------|
| Password | `sshpass` must be installed    |
| Key file | Absolute path to the `.pem` / private key file |

## License

MIT
