from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Dict, List, Optional
import asyncio
import aiosqlite
import json
import shlex
import shutil
import socket
import subprocess
import uuid
from pathlib import Path

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB = Path(__file__).parent / "uptoco.db"


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
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS floors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS floor_plans (
    floor_id TEXT PRIMARY KEY REFERENCES floors(id) ON DELETE CASCADE,
    width INTEGER DEFAULT 25,
    height INTEGER DEFAULT 18,
    cells TEXT DEFAULT '{}',
    labels TEXT DEFAULT '[]',
    borders TEXT DEFAULT '{}',
    rects TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS placed_machines (
    id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    row_pos INTEGER NOT NULL,
    col_pos INTEGER NOT NULL,
    UNIQUE(floor_id, row_pos, col_pos)
);
"""


async def init_db():
    async with aiosqlite.connect(DB) as db:
        await db.executescript(SCHEMA)
        # Migrations for existing databases
        for migration in [
            "ALTER TABLE floor_plans ADD COLUMN borders TEXT DEFAULT '{}'",
            "ALTER TABLE floor_plans ADD COLUMN rects TEXT DEFAULT '[]'",
        ]:
            try:
                await db.execute(migration)
                await db.commit()
            except Exception:
                pass


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


class FloorIn(BaseModel):
    name: str
    position: int = 0


class CellsBody(BaseModel):
    cells: dict


class LabelsBody(BaseModel):
    labels: list


class BordersBody(BaseModel):
    borders: dict


class RectsBody(BaseModel):
    rects: list


class SizeBody(BaseModel):
    width: int
    height: int


class PlaceMachineBody(BaseModel):
    machine_id: str
    row: int
    col: int


class ImportBody(BaseModel):
    machines: list
    floors: list
    plans: list


# ── Startup ──────────────────────────────────────────────────────────────────

connections: List[WebSocket] = []
pc_statuses: Dict[str, bool] = {}


@app.on_event("startup")
async def startup():
    await init_db()
    asyncio.create_task(ping_loop())


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
            "INSERT INTO machines VALUES (?,?,?,?,?,?,?,?,?,?)",
            (mid, m.name, m.type, m.ip, m.ssh_user, m.ssh_port,
             m.ssh_auth_type, m.ssh_key_path, m.ssh_password, m.notes),
        )
        await db.commit()
    return {"id": mid, **m.model_dump()}


@app.put("/api/machines/{mid}")
async def update_machine(mid: str, m: MachineIn):
    async with aiosqlite.connect(DB) as db:
        await db.execute(
            "UPDATE machines SET name=?,type=?,ip=?,ssh_user=?,ssh_port=?,"
            "ssh_auth_type=?,ssh_key_path=?,ssh_password=?,notes=? WHERE id=?",
            (m.name, m.type, m.ip, m.ssh_user, m.ssh_port,
             m.ssh_auth_type, m.ssh_key_path, m.ssh_password, m.notes, mid),
        )
        await db.commit()
    return {"id": mid, **m.model_dump()}


@app.delete("/api/machines/{mid}")
async def delete_machine(mid: str):
    async with aiosqlite.connect(DB) as db:
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
        await db.execute("DELETE FROM floors WHERE id=?", (fid,))
        await db.commit()
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
            "SELECT pm.id, pm.machine_id, pm.floor_id, pm.row_pos, pm.col_pos,"
            " m.name, m.type, m.ip FROM placed_machines pm"
            " JOIN machines m ON pm.machine_id=m.id WHERE pm.floor_id=?", (fid,)
        ) as c:
            placed_machines = await c.fetchall()
    return {
        "floor_id": plan["floor_id"],
        "width": plan["width"],
        "height": plan["height"],
        "cells": json.loads(plan["cells"]),
        "labels": json.loads(plan["labels"]),
        "borders": json.loads(plan["borders"] or "{}"),
        "rects": json.loads(plan["rects"] or "[]"),
        "placed_machines": placed_machines,
    }


@app.put("/api/floors/{fid}/plan/cells")
async def save_cells(fid: str, body: CellsBody):
    async with aiosqlite.connect(DB) as db:
        await db.execute("UPDATE floor_plans SET cells=? WHERE floor_id=?",
                         (json.dumps(body.cells), fid))
        await db.commit()
    return {"ok": True}


@app.put("/api/floors/{fid}/plan/labels")
async def save_labels(fid: str, body: LabelsBody):
    async with aiosqlite.connect(DB) as db:
        await db.execute("UPDATE floor_plans SET labels=? WHERE floor_id=?",
                         (json.dumps(body.labels), fid))
        await db.commit()
    return {"ok": True}


@app.put("/api/floors/{fid}/plan/borders")
async def save_borders(fid: str, body: BordersBody):
    async with aiosqlite.connect(DB) as db:
        await db.execute("UPDATE floor_plans SET borders=? WHERE floor_id=?",
                         (json.dumps(body.borders), fid))
        await db.commit()
    return {"ok": True}


@app.put("/api/floors/{fid}/plan/rects")
async def save_rects(fid: str, body: RectsBody):
    async with aiosqlite.connect(DB) as db:
        await db.execute("UPDATE floor_plans SET rects=? WHERE floor_id=?",
                         (json.dumps(body.rects), fid))
        await db.commit()
    return {"ok": True}


@app.put("/api/floors/{fid}/plan/size")
async def save_size(fid: str, body: SizeBody):
    async with aiosqlite.connect(DB) as db:
        await db.execute("UPDATE floor_plans SET width=?,height=? WHERE floor_id=?",
                         (body.width, body.height, fid))
        await db.commit()
    return {"ok": True}


@app.post("/api/floors/{fid}/plan/machines")
async def place_machine(fid: str, body: PlaceMachineBody):
    pid = str(uuid.uuid4())
    async with aiosqlite.connect(DB) as db:
        await db.execute(
            "DELETE FROM placed_machines WHERE floor_id=? AND machine_id=?",
            (fid, body.machine_id),
        )
        await db.execute(
            "INSERT OR REPLACE INTO placed_machines (id,machine_id,floor_id,row_pos,col_pos)"
            " VALUES (?,?,?,?,?)",
            (pid, body.machine_id, fid, body.row, body.col),
        )
        await db.commit()
    return {"ok": True, "id": pid}


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
                "SELECT id, machine_id, floor_id, row_pos, col_pos"
                " FROM placed_machines WHERE floor_id=?", (f["id"],)
            ) as c:
                placed = await c.fetchall()
            if plan:
                plans.append({
                    "floor_id": plan["floor_id"],
                    "width": plan["width"],
                    "height": plan["height"],
                    "cells": json.loads(plan["cells"]),
                    "labels": json.loads(plan["labels"]),
                    "borders": json.loads(plan["borders"] or "{}"),
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
                "INSERT INTO machines VALUES (?,?,?,?,?,?,?,?,?,?)",
                (m["id"], m["name"], m["type"], m.get("ip", ""), m.get("ssh_user", "root"),
                 m.get("ssh_port", 22), m.get("ssh_auth_type", "password"),
                 m.get("ssh_key_path", ""), m.get("ssh_password", ""), m.get("notes", "")),
            )
        for f in body.floors:
            await db.execute("INSERT INTO floors VALUES (?,?,?)", (f["id"], f["name"], f["position"]))
        for p in body.plans:
            cells = json.dumps(p["cells"]) if isinstance(p["cells"], dict) else p["cells"]
            labels = json.dumps(p["labels"]) if isinstance(p["labels"], list) else p["labels"]
            borders_val = p.get("borders", {})
            borders = json.dumps(borders_val) if isinstance(borders_val, dict) else borders_val
            rects_val = p.get("rects", [])
            rects = json.dumps(rects_val) if isinstance(rects_val, list) else rects_val
            await db.execute(
                "INSERT INTO floor_plans (floor_id, width, height, cells, labels, borders, rects) VALUES (?,?,?,?,?,?,?)",
                (p["floor_id"], p["width"], p["height"], cells, labels, borders, rects),
            )
            for pm in p.get("placed_machines", []):
                await db.execute(
                    "INSERT INTO placed_machines (id,machine_id,floor_id,row_pos,col_pos) VALUES (?,?,?,?,?)",
                    (pm["id"], pm["machine_id"], pm["floor_id"], pm["row_pos"], pm["col_pos"]),
                )
        await db.commit()
    return {"ok": True}


# ── SSH ───────────────────────────────────────────────────────────────────────

@app.post("/api/ssh/{machine_id}")
async def open_ssh(machine_id: str):
    async with aiosqlite.connect(DB) as db:
        db.row_factory = row_factory
        async with db.execute("SELECT * FROM machines WHERE id=?", (machine_id,)) as c:
            m = await c.fetchone()
    if not m:
        raise HTTPException(404, "Machine introuvable")

    user, host, port = m["ssh_user"] or "root", m["ip"], m["ssh_port"] or 22

    if m["ssh_auth_type"] == "key" and m["ssh_key_path"]:
        ssh_cmd = f"ssh -i {shlex.quote(m['ssh_key_path'])} {user}@{host} -p {port}"
    elif m["ssh_auth_type"] == "password" and m["ssh_password"]:
        if not shutil.which("sshpass"):
            return {"error": "sshpass n'est pas installé. Lancez : sudo apt install sshpass"}
        ssh_cmd = f"sshpass -p {shlex.quote(m['ssh_password'])} ssh -o StrictHostKeyChecking=no {user}@{host} -p {port}"
    else:
        ssh_cmd = f"ssh {user}@{host} -p {port}"

    bash_cmd = f"{ssh_cmd}; exec bash"
    terminals = [
        ["gnome-terminal", "--", "bash", "-c", bash_cmd],
        ["xterm", "-e", "bash", "-c", bash_cmd],
        ["konsole", "--noclose", "-e", "bash", "-c", bash_cmd],
        ["xfce4-terminal", "-x", "bash", "-c", bash_cmd],
        ["terminator", "-x", "bash", "-c", bash_cmd],
        ["x-terminal-emulator", "-e", "bash", "-c", bash_cmd],
    ]
    for cmd in terminals:
        if shutil.which(cmd[0]):
            subprocess.Popen(cmd)
            return {"ok": True, "terminal": cmd[0]}
    return {"error": "Aucun émulateur de terminal trouvé (installez xterm ou gnome-terminal)"}


# ── Ping / WebSocket ──────────────────────────────────────────────────────────

async def ping_host(ip: str) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", "1", ip,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=3.0)
        if proc.returncode == 0:
            return True
    except Exception:
        pass
    try:
        loop = asyncio.get_event_loop()
        conn = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: socket.create_connection((ip, 22), 1)),
            timeout=2.0,
        )
        conn.close()
        return True
    except Exception:
        return False


async def ping_loop():
    while True:
        async with aiosqlite.connect(DB) as db:
            db.row_factory = row_factory
            async with db.execute("SELECT id, ip FROM machines WHERE ip != ''") as c:
                machines = await c.fetchall()
        if machines:
            results = await asyncio.gather(*[ping_host(m["ip"]) for m in machines])
            statuses = {m["id"]: r for m, r in zip(machines, results)}
            pc_statuses.update(statuses)
            msg = json.dumps({"type": "status", "data": statuses})
            for ws in connections[:]:
                try:
                    await ws.send_text(msg)
                except Exception:
                    connections.remove(ws)
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
        f = DIST / full_path
        return FileResponse(f if f.exists() and f.is_file() else DIST / "index.html")
