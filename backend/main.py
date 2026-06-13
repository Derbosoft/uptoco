from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Any, Dict, List
import asyncio
import aiosqlite
import fcntl
import json
import os
import pty
import shutil
import struct
import termios
import uuid
from pathlib import Path


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    asyncio.create_task(ping_loop())
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB = Path(__file__).parent / "uptoco.db"
UPLOADS = Path(__file__).parent / "uploads"
UPLOADS.mkdir(exist_ok=True)


# ── Schema ──────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'pc',
    ip TEXT DEFAULT '',
    ssh_user TEXT DEFAULT 'root',
    ssh_port INTEGER DEFAULT 22,
    ssh_auth_type TEXT DEFAULT 'password',
    ssh_key_path TEXT DEFAULT '',
    ssh_password TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    color TEXT DEFAULT '#6b7280'
);
CREATE TABLE IF NOT EXISTS floors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS floor_plans (
    floor_id TEXT PRIMARY KEY REFERENCES floors(id) ON DELETE CASCADE,
    image_path TEXT
);
CREATE TABLE IF NOT EXISTS placed_machines (
    id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    x REAL NOT NULL DEFAULT 0.5,
    y REAL NOT NULL DEFAULT 0.5,
    scale REAL NOT NULL DEFAULT 1.0,
    UNIQUE(floor_id, machine_id)
);
"""

MIGRATIONS = [
    "ALTER TABLE floor_plans ADD COLUMN image_path TEXT",
    "ALTER TABLE placed_machines ADD COLUMN x REAL DEFAULT 0.5",
    "ALTER TABLE placed_machines ADD COLUMN y REAL DEFAULT 0.5",
    "ALTER TABLE placed_machines ADD COLUMN scale REAL DEFAULT 1.0",
    "ALTER TABLE machines ADD COLUMN color TEXT DEFAULT '#6b7280'",
]


async def init_db():
    async with aiosqlite.connect(DB) as db:
        await db.executescript(SCHEMA)
        for migration in MIGRATIONS:
            try:
                await db.execute(migration)
                await db.commit()
            except Exception:
                pass
        # Reconstruit placed_machines si les anciennes colonnes row_pos/col_pos sont présentes
        async with db.execute("PRAGMA table_info(placed_machines)") as c:
            existing_cols = {row[1] for row in await c.fetchall()}
        if "row_pos" in existing_cols or "col_pos" in existing_cols:
            await db.executescript("""
                CREATE TABLE IF NOT EXISTS _placed_machines_new (
                    id TEXT PRIMARY KEY,
                    machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
                    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
                    x REAL NOT NULL DEFAULT 0.5,
                    y REAL NOT NULL DEFAULT 0.5,
                    scale REAL NOT NULL DEFAULT 1.0,
                    UNIQUE(floor_id, machine_id)
                );
                INSERT OR IGNORE INTO _placed_machines_new
                    SELECT id, machine_id, floor_id, x, y, COALESCE(scale, 1.0) FROM placed_machines;
                DROP TABLE placed_machines;
                ALTER TABLE _placed_machines_new RENAME TO placed_machines;
            """)


def row_factory(cursor, row):
    return {col[0]: row[i] for i, col in enumerate(cursor.description)}


# ── Pydantic models ──────────────────────────────────────────────────────────

class MachineIn(BaseModel):
    name: str
    type: str = "pc"
    ip: str = ""
    ssh_user: str = "root"
    ssh_port: int = 22
    ssh_auth_type: str = "password"
    ssh_key_path: str = ""
    ssh_password: str = ""
    notes: str = ""
    color: str = "#6b7280"


class FloorIn(BaseModel):
    name: str
    position: int = 0


class PlaceMachineBody(BaseModel):
    machine_id: str
    x: float = 0.5
    y: float = 0.5


class MoveMachineBody(BaseModel):
    x: float
    y: float


class ScaleMachineBody(BaseModel):
    scale: float


class ImportBody(BaseModel):
    machines: List[Dict[str, Any]]
    floors: List[Dict[str, Any]]
    plans: List[Dict[str, Any]]


# ── Startup ──────────────────────────────────────────────────────────────────

connections: List[WebSocket] = []
pc_statuses: Dict[str, bool] = {}




# ── Static uploads ────────────────────────────────────────────────────────────

app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")


# ── Machines ──────────────────────────────────────────────────────────────────

@app.get("/api/machines")
async def get_machines():
    async with aiosqlite.connect(DB) as db:
        db.row_factory = row_factory
        async with db.execute("SELECT * FROM machines ORDER BY name") as c:
            return await c.fetchall()


@app.post("/api/machines", status_code=201)
async def create_machine(m: MachineIn):
    mid = str(uuid.uuid4())
    async with aiosqlite.connect(DB) as db:
        await db.execute(
            "INSERT INTO machines VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (mid, m.name, m.type, m.ip, m.ssh_user, m.ssh_port,
             m.ssh_auth_type, m.ssh_key_path, m.ssh_password, m.notes, m.color),
        )
        await db.commit()
    return {"id": mid, **m.model_dump()}


@app.put("/api/machines/{mid}")
async def update_machine(mid: str, m: MachineIn):
    async with aiosqlite.connect(DB) as db:
        await db.execute(
            "UPDATE machines SET name=?,type=?,ip=?,ssh_user=?,ssh_port=?,"
            "ssh_auth_type=?,ssh_key_path=?,ssh_password=?,notes=?,color=? WHERE id=?",
            (m.name, m.type, m.ip, m.ssh_user, m.ssh_port,
             m.ssh_auth_type, m.ssh_key_path, m.ssh_password, m.notes, m.color, mid),
        )
        await db.commit()
    return {"id": mid, **m.model_dump()}


@app.delete("/api/machines/{mid}")
async def delete_machine(mid: str):
    async with aiosqlite.connect(DB) as db:
        await db.execute("PRAGMA foreign_keys = ON")  # sinon ON DELETE CASCADE ne fait rien
        await db.execute("DELETE FROM machines WHERE id=?", (mid,))
        await db.commit()
    return {"ok": True}


# ── Floors ───────────────────────────────────────────────────────────────────

@app.get("/api/floors")
async def get_floors():
    async with aiosqlite.connect(DB) as db:
        db.row_factory = row_factory
        async with db.execute("SELECT * FROM floors ORDER BY position, name") as c:
            return await c.fetchall()


@app.post("/api/floors", status_code=201)
async def create_floor(f: FloorIn):
    fid = str(uuid.uuid4())
    async with aiosqlite.connect(DB) as db:
        await db.execute("INSERT INTO floors VALUES (?,?,?)", (fid, f.name, f.position))
        await db.execute("INSERT INTO floor_plans (floor_id) VALUES (?)", (fid,))
        await db.commit()
    return {"id": fid, **f.model_dump()}


@app.put("/api/floors/{fid}")
async def update_floor(fid: str, f: FloorIn):
    async with aiosqlite.connect(DB) as db:
        await db.execute("UPDATE floors SET name=?,position=? WHERE id=?", (f.name, f.position, fid))
        await db.commit()
    return {"id": fid, **f.model_dump()}


@app.delete("/api/floors/{fid}")
async def delete_floor(fid: str):
    async with aiosqlite.connect(DB) as db:
        await db.execute("PRAGMA foreign_keys = ON")  # sinon ON DELETE CASCADE ne fait rien
        db.row_factory = row_factory
        async with db.execute("SELECT image_path FROM floor_plans WHERE floor_id=?", (fid,)) as c:
            plan = await c.fetchone()
        await db.execute("DELETE FROM floors WHERE id=?", (fid,))
        await db.commit()
    # Supprime l'image du plan sur le disque (sinon elle reste orpheline)
    if plan and plan.get("image_path"):
        try:
            (UPLOADS / plan["image_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    return {"ok": True}


# ── Floor plan ────────────────────────────────────────────────────────────────

@app.get("/api/floors/{fid}/plan")
async def get_plan(fid: str):
    async with aiosqlite.connect(DB) as db:
        db.row_factory = row_factory
        async with db.execute("SELECT * FROM floor_plans WHERE floor_id=?", (fid,)) as c:
            plan = await c.fetchone()
        if not plan:
            raise HTTPException(404, "Plan introuvable")
        async with db.execute(
            "SELECT pm.id, pm.machine_id, pm.floor_id, pm.x, pm.y, pm.scale,"
            " m.name, m.type, m.ip, m.color FROM placed_machines pm"
            " JOIN machines m ON pm.machine_id=m.id WHERE pm.floor_id=?", (fid,)
        ) as c:
            placed_machines = await c.fetchall()
    image_path = plan.get("image_path")
    return {
        "floor_id": plan["floor_id"],
        "image_url": f"/uploads/{image_path}" if image_path else None,
        "placed_machines": placed_machines,
    }


@app.post("/api/floors/{fid}/plan/image")
async def upload_image(fid: str, file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".bmp"}:
        raise HTTPException(400, "Format d'image non supporté")
    filename = f"{fid}{ext}"
    content = await file.read()
    (UPLOADS / filename).write_bytes(content)
    async with aiosqlite.connect(DB) as db:
        db.row_factory = row_factory
        async with db.execute("SELECT image_path FROM floor_plans WHERE floor_id=?", (fid,)) as c:
            old = await c.fetchone()
        await db.execute("UPDATE floor_plans SET image_path=? WHERE floor_id=?", (filename, fid))
        await db.commit()
    # Supprime l'ancienne image si son nom diffère (changement d'extension)
    if old and old.get("image_path") and old["image_path"] != filename:
        try:
            (UPLOADS / old["image_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    return {"ok": True, "url": f"/uploads/{filename}"}


@app.post("/api/floors/{fid}/plan/machines")
async def place_machine(fid: str, body: PlaceMachineBody):
    pid = str(uuid.uuid4())
    async with aiosqlite.connect(DB) as db:
        await db.execute(
            "DELETE FROM placed_machines WHERE floor_id=? AND machine_id=?",
            (fid, body.machine_id),
        )
        await db.execute(
            "INSERT INTO placed_machines (id, machine_id, floor_id, x, y) VALUES (?,?,?,?,?)",
            (pid, body.machine_id, fid, body.x, body.y),
        )
        await db.commit()
    return {"ok": True, "id": pid}


@app.put("/api/floors/{fid}/plan/machines/{machine_id}/position")
async def move_machine(fid: str, machine_id: str, body: MoveMachineBody):
    async with aiosqlite.connect(DB) as db:
        await db.execute(
            "UPDATE placed_machines SET x=?, y=? WHERE floor_id=? AND machine_id=?",
            (body.x, body.y, fid, machine_id),
        )
        await db.commit()
    return {"ok": True}


@app.put("/api/floors/{fid}/plan/machines/{machine_id}/scale")
async def scale_machine(fid: str, machine_id: str, body: ScaleMachineBody):
    async with aiosqlite.connect(DB) as db:
        await db.execute(
            "UPDATE placed_machines SET scale=? WHERE floor_id=? AND machine_id=?",
            (max(0.5, min(3.0, body.scale)), fid, machine_id),
        )
        await db.commit()
    return {"ok": True}


@app.delete("/api/floors/{fid}/plan/machines/{machine_id}")
async def remove_machine(fid: str, machine_id: str):
    async with aiosqlite.connect(DB) as db:
        await db.execute(
            "DELETE FROM placed_machines WHERE floor_id=? AND machine_id=?",
            (fid, machine_id),
        )
        await db.commit()
    return {"ok": True}


# ── Export / Import ───────────────────────────────────────────────────────────

@app.get("/api/export")
async def export_data():
    async with aiosqlite.connect(DB) as db:
        db.row_factory = row_factory
        async with db.execute("SELECT * FROM machines ORDER BY name") as c:
            machines = await c.fetchall()
        async with db.execute("SELECT * FROM floors ORDER BY position, name") as c:
            floors = await c.fetchall()
        plans = []
        for f in floors:
            async with db.execute("SELECT * FROM floor_plans WHERE floor_id=?", (f["id"],)) as c:
                plan = await c.fetchone()
            async with db.execute(
                "SELECT id, machine_id, floor_id, x, y FROM placed_machines WHERE floor_id=?", (f["id"],)
            ) as c:
                placed = await c.fetchall()
            if plan:
                plans.append({
                    "floor_id": plan["floor_id"],
                    "image_path": plan.get("image_path"),
                    "placed_machines": placed,
                })
    return {"machines": machines, "floors": floors, "plans": plans}


@app.post("/api/import")
async def import_data(body: ImportBody):
    async with aiosqlite.connect(DB) as db:
        await db.execute("DELETE FROM placed_machines")
        await db.execute("DELETE FROM floor_plans")
        await db.execute("DELETE FROM floors")
        await db.execute("DELETE FROM machines")
        for m in body.machines:
            await db.execute(
                "INSERT INTO machines VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (m["id"], m["name"], m.get("type", "pc"), m.get("ip", ""), m.get("ssh_user", "root"),
                 m.get("ssh_port", 22), m.get("ssh_auth_type", "password"),
                 m.get("ssh_key_path", ""), m.get("ssh_password", ""), m.get("notes", ""),
                 m.get("color", "#6b7280")),
            )
        for f in body.floors:
            await db.execute("INSERT INTO floors VALUES (?,?,?)", (f["id"], f["name"], f.get("position", 0)))
        for p in body.plans:
            await db.execute(
                "INSERT INTO floor_plans (floor_id, image_path) VALUES (?,?)",
                (p["floor_id"], p.get("image_path")),
            )
            for pm in p.get("placed_machines", []):
                x = pm.get("x", pm.get("col_pos", 0.5) if isinstance(pm.get("col_pos"), float) else 0.5)
                y = pm.get("y", pm.get("row_pos", 0.5) if isinstance(pm.get("row_pos"), float) else 0.5)
                await db.execute(
                    "INSERT INTO placed_machines (id, machine_id, floor_id, x, y) VALUES (?,?,?,?,?)",
                    (pm["id"], pm["machine_id"], pm["floor_id"], x, y),
                )
        await db.commit()
    return {"ok": True}


# ── Terminal SSH WebSocket (PTY) ─────────────────────────────────────────────

@app.websocket("/ws/ssh/{machine_id}")
async def ws_ssh_terminal(ws: WebSocket, machine_id: str):
    await ws.accept()

    async with aiosqlite.connect(DB) as db:
        db.row_factory = row_factory
        async with db.execute("SELECT * FROM machines WHERE id=?", (machine_id,)) as c:
            m = await c.fetchone()

    if not m or not m.get("ip"):
        await ws.send_bytes(b"\r\nErreur : machine introuvable ou adresse IP manquante.\r\n")
        return

    user = m["ssh_user"] or "root"
    host = m["ip"]
    port = str(m["ssh_port"] or 22)
    env  = os.environ.copy()

    if m["ssh_auth_type"] == "key" and m["ssh_key_path"]:
        cmd = ["ssh", "-i", m["ssh_key_path"], "-p", port,
               "-o", "StrictHostKeyChecking=no", f"{user}@{host}"]
    elif m["ssh_auth_type"] == "password" and m["ssh_password"]:
        if not shutil.which("sshpass"):
            await ws.send_bytes(b"\r\nsshpass n'est pas installe. Lancez : sudo apt install sshpass\r\n")
            return
        env["SSHPASS"] = m["ssh_password"]
        cmd = ["sshpass", "-e", "ssh", "-p", port,
               "-o", "StrictHostKeyChecking=no", f"{user}@{host}"]
    else:
        cmd = ["ssh", "-p", port, f"{user}@{host}"]

    master_fd, slave_fd = pty.openpty()
    loop = asyncio.get_event_loop()
    pty_queue: asyncio.Queue = asyncio.Queue()
    proc = None

    def _on_readable():
        try:
            data = os.read(master_fd, 4096)
            pty_queue.put_nowait(data)
        except OSError:
            loop.remove_reader(master_fd)
            pty_queue.put_nowait(None)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
            env=env, close_fds=True,
        )
        os.close(slave_fd)
        slave_fd = -1
        loop.add_reader(master_fd, _on_readable)

        async def pty_to_ws():
            while True:
                data = await pty_queue.get()
                if data is None:
                    break
                try:
                    await ws.send_bytes(data)
                except Exception:
                    break
            try:
                await ws.close()
            except Exception:
                pass

        async def ws_to_pty():
            try:
                while True:
                    msg = await ws.receive()
                    if msg.get("type") == "websocket.disconnect":
                        break
                    if msg.get("bytes"):
                        os.write(master_fd, msg["bytes"])
                    elif msg.get("text"):
                        try:
                            ev = json.loads(msg["text"])
                            if ev.get("type") == "resize":
                                cols = max(1, int(ev.get("cols", 80)))
                                rows = max(1, int(ev.get("rows", 24)))
                                fcntl.ioctl(master_fd, termios.TIOCSWINSZ,
                                            struct.pack("HHHH", rows, cols, 0, 0))
                        except Exception:
                            pass
            except Exception:
                pass
            finally:
                try:
                    proc.kill()
                except Exception:
                    pass

        await asyncio.gather(pty_to_ws(), ws_to_pty(), return_exceptions=True)

    finally:
        # Ferme le slave_fd s'il n'a pas pu l'être (échec du spawn)
        if slave_fd != -1:
            try:
                os.close(slave_fd)
            except Exception:
                pass
        loop.remove_reader(master_fd)
        if proc is not None:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
        try:
            os.close(master_fd)
        except Exception:
            pass


# ── Ping / WebSocket ──────────────────────────────────────────────────────────

async def ping_host(ip: str) -> bool:
    # Tentative 1 : ping ICMP
    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", "1", ip,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=3.0)
        if proc.returncode == 0:
            return True
    except asyncio.TimeoutError:
        # Tue le ping qui traîne pour éviter les processus zombies + fuite de fd
        try:
            proc.kill()
            await proc.wait()
        except Exception:
            pass
    except Exception:
        # create_subprocess_exec a échoué ; s'assurer qu'aucun proc ne traîne
        if proc is not None:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass

    # Tentative 2 : connexion TCP sur le port 22 (100 % asyncio, sans thread)
    writer = None
    try:
        _, writer = await asyncio.wait_for(asyncio.open_connection(ip, 22), timeout=2.0)
        return True
    except Exception:
        return False
    finally:
        if writer is not None:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass


async def ping_loop():
    while True:
        try:
            async with aiosqlite.connect(DB) as db:
                db.row_factory = row_factory
                async with db.execute("SELECT id, ip FROM machines WHERE ip != ''") as c:
                    machines = await c.fetchall()
            if machines:
                # return_exceptions=True : une erreur sur un ping ne fait pas planter le gather
                results = await asyncio.gather(
                    *[ping_host(m["ip"]) for m in machines],
                    return_exceptions=True,
                )
                statuses = {m["id"]: (r is True) for m, r in zip(machines, results)}
                pc_statuses.update(statuses)
                msg = json.dumps({"type": "status", "data": statuses})
                for ws in connections[:]:
                    try:
                        await ws.send_text(msg)
                    except Exception:
                        try:
                            connections.remove(ws)
                        except ValueError:
                            pass
        except Exception:
            # La boucle ne doit jamais mourir, sinon les statuts se figent définitivement
            pass
        await asyncio.sleep(30)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    connections.append(ws)
    await ws.send_text(json.dumps({"type": "status", "data": pc_statuses}))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in connections:
            connections.remove(ws)


# ── Serve built frontend ──────────────────────────────────────────────────────

DIST = Path(__file__).parent.parent / "frontend" / "dist"

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(DIST / "index.html")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Résolution confinée à DIST pour bloquer la traversée de chemin (../../etc/passwd)
        target = (DIST / full_path).resolve()
        if target.is_file() and target.is_relative_to(DIST.resolve()):
            return FileResponse(target)
        return FileResponse(DIST / "index.html")
