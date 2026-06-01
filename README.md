# UpToco

A visual computer park management tool. Upload your office floor plan, place machines on it, monitor their online/offline status in real time, and open SSH sessions in one click.

![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![React](https://img.shields.io/badge/react-18-61dafb)

---

## Features

- **Floor plan** — upload any image (PNG, JPG, SVG…) as your floor background
- **Machine inventory** — create machines (PC, server, laptop, printer, switch, router…) with SSH credentials and a custom color
- **Drag & drop** — drag machines from the inventory onto the floor plan
- **Real-time status** — ICMP ping every 30 s with green/red indicator per machine; results broadcast via WebSocket
- **SSH connection** — one click opens a terminal with the correct credentials (password via `sshpass`, key file supported)
- **Multi-floor** — create and switch between floors, each with its own plan
- **Zoom & pan** — scroll wheel to zoom (30 %–400 %, centered on cursor), drag the background to pan freely
- **Machine resize** — drag the resize handle on any placed machine to scale it
- **Export / Import JSON** — full backup and restore of all data

## Stack

| Layer    | Technology                                          |
|----------|-----------------------------------------------------|
| Backend  | Python · FastAPI · aiosqlite (SQLite) · WebSocket   |
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
curl -sSL https://raw.githubusercontent.com/Derbosoft/uptoco/main/get.sh | bash
bash install.sh
bash start.sh
```

The app is available at **http://localhost:8000**.

| Script | Role |
|--------|------|
| `curl … \| bash` | Clones the repo and creates local `install.sh` / `start.sh` wrappers |
| `bash install.sh` | Creates the Python venv, installs dependencies, builds the frontend |
| `bash start.sh` | Fixes permissions if needed, rebuilds the frontend, starts the FastAPI backend |

## Development mode

```bash
# Terminal 1 — backend (hot-reload)
cd backend
../.venv/bin/uvicorn main:app --reload --port 8000

# Terminal 2 — frontend (Vite dev server with proxy to :8000)
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

## Project structure

```
uptoco/
├── backend/
│   ├── main.py          # FastAPI app — REST API, WebSocket, SSH, static serving
│   ├── requirements.txt
│   ├── uptoco.db        # SQLite database (auto-created on first run)
│   └── uploads/         # Uploaded floor plan images
├── frontend/
│   ├── src/
│   │   ├── components/  # FloorCanvas, Sidebar, TopNav, MachineModal, MachinePopup
│   │   ├── views/       # InventoryView, PlansView
│   │   ├── store.ts     # Zustand global state
│   │   └── types.ts     # Shared TypeScript types
│   └── dist/            # Built frontend (served by FastAPI)
├── get.sh               # Download script (clone repo + create wrappers)
├── install.sh           # Dependency installer + frontend build
└── start.sh             # Permission fix + frontend build + backend start
```

## Usage

1. **Add a floor** — click *+ Ajouter* in the sidebar floor section
2. **Upload a plan** — drag an image onto the canvas, or click *🖼 Changer l'image*
3. **Add machines** — go to the *Inventaire* view, fill in the SSH credentials and color, save
4. **Place machines** — drag a machine from the sidebar onto the floor plan
5. **Navigate** — scroll to zoom in/out (centered on cursor), drag the background to pan
6. **Connect via SSH** — click a placed machine → *Connexion SSH* in the popup
7. **Resize a machine** — drag the ↘ handle in the bottom-right corner of a machine card
8. **Backup** — *⬇ Export* downloads a JSON backup; *⬆ Import* restores it

## SSH authentication

| Type     | Requirement                                        |
|----------|----------------------------------------------------|
| Password | `sshpass` installed (`sudo apt install sshpass`)   |
| Key file | Absolute path to the `.pem` / private key file     |

## License

MIT
