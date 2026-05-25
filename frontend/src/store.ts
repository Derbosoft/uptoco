import { create } from 'zustand'
import { Machine, Floor, FloorPlan, Tool, Label, Cell, PlanRect } from './types'

interface PlanSnapshot {
  cells: FloorPlan['cells']
  labels: FloorPlan['labels']
  borders: FloorPlan['borders']
  rects: FloorPlan['rects']
}

interface AppStore {
  // Server data
  machines: Machine[]
  floors: Floor[]
  plan: FloorPlan | null
  statuses: Record<string, boolean | undefined>

  // UI
  view: 'inventory' | 'plans'
  activeFloorId: string | null
  tool: Tool
  toolColor: string
  zoom: number
  searchQuery: string

  // Undo / redo
  _history: PlanSnapshot[]
  _historyIdx: number

  // Actions: navigation
  setView: (v: 'inventory' | 'plans') => void
  setTool: (t: Tool) => void
  setToolColor: (c: string) => void
  setZoom: (z: number) => void
  setSearchQuery: (q: string) => void
  updateStatuses: (s: Record<string, boolean>) => void

  // Actions: data loading
  loadAll: () => Promise<void>
  loadFloorPlan: (floorId: string) => Promise<void>

  // Actions: machines CRUD
  createMachine: (m: Omit<Machine, 'id'>) => Promise<void>
  updateMachine: (id: string, m: Omit<Machine, 'id'>) => Promise<void>
  deleteMachine: (id: string) => Promise<void>

  // Actions: floors CRUD
  createFloor: (name: string) => Promise<string>
  updateFloor: (id: string, name: string, position: number) => Promise<void>
  deleteFloor: (id: string) => Promise<void>

  // Actions: plan editing (cells — erase only)
  pushHistory: () => void
  paintCell: (row: number, col: number) => void
  saveCells: () => void

  // Actions: plan editing (labels)
  upsertLabel: (label: Label) => void
  deleteLabel: (id: string) => void

  // Actions: plan editing (borders)
  toggleBorder: (key: string) => void

  // Actions: plan editing (rects)
  addRect: (rect: PlanRect) => void
  removeRect: (id: string) => void

  // Actions: plan size
  updatePlanSize: (width: number, height: number) => Promise<void>

  // Actions: placed machines
  placeMachine: (machineId: string, row: number, col: number) => Promise<void>
  removeMachine: (machineId: string) => Promise<void>

  // Actions: undo / redo
  undo: () => void
  redo: () => void

  // Actions: SSH
  openSSH: (machineId: string) => Promise<{ ok?: boolean; terminal?: string; error?: string }>
}

let cellTimer: ReturnType<typeof setTimeout> | null = null
let labelTimer: ReturnType<typeof setTimeout> | null = null
let borderTimer: ReturnType<typeof setTimeout> | null = null
let rectsTimer: ReturnType<typeof setTimeout> | null = null

const saveRectsDebounced = (get: () => AppStore) => {
  if (rectsTimer) clearTimeout(rectsTimer)
  rectsTimer = setTimeout(() => {
    const { plan } = get()
    if (!plan) return
    fetch(`/api/floors/${plan.floor_id}/plan/rects`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rects: plan.rects }),
    }).catch(console.error)
  }, 600)
}

const saveBordersDebounced = (get: () => AppStore) => {
  if (borderTimer) clearTimeout(borderTimer)
  borderTimer = setTimeout(() => {
    const { plan } = get()
    if (!plan) return
    fetch(`/api/floors/${plan.floor_id}/plan/borders`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ borders: plan.borders }),
    }).catch(console.error)
  }, 600)
}

const getRectBorderKeys = (rect: { row: number; col: number; width: number; height: number }): string[] => {
  const keys: string[] = []
  const { row: r, col: c, width: w, height: h } = rect
  for (let x = c; x < c + w; x++) {
    keys.push(`h:${r}:${x}`)       // top edge
    keys.push(`h:${r + h}:${x}`)   // bottom edge
  }
  for (let y = r; y < r + h; y++) {
    keys.push(`v:${y}:${c}`)       // left edge
    keys.push(`v:${y}:${c + w}`)   // right edge
  }
  return keys
}

export const useStore = create<AppStore>((set, get) => ({
  machines: [],
  floors: [],
  plan: null,
  statuses: {},
  view: 'plans',
  activeFloorId: null,
  tool: 'select',
  toolColor: '#DBEAFE',
  zoom: 1,
  searchQuery: '',
  _history: [],
  _historyIdx: -1,

  setView: (v) => set({ view: v }),
  setTool: (t) => set({ tool: t }),
  setToolColor: (c) => set({ toolColor: c }),
  setZoom: (z) => set({ zoom: Math.min(2, Math.max(0.4, z)) }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  updateStatuses: (s) => set((st) => ({ statuses: { ...st.statuses, ...s } })),

  // ── Loading ──────────────────────────────────────────────────────────────

  loadAll: async () => {
    const [machines, floors] = await Promise.all([
      fetch('/api/machines').then(r => r.json()),
      fetch('/api/floors').then(r => r.json()),
    ])
    set({ machines, floors })
    if (floors.length > 0) {
      await get().loadFloorPlan(floors[0].id)
      set({ activeFloorId: floors[0].id })
    }
  },

  loadFloorPlan: async (floorId) => {
    const plan: FloorPlan = await fetch(`/api/floors/${floorId}/plan`).then(r => r.json())
    plan.rects = plan.rects ?? []
    plan.borders = plan.borders ?? {}
    set({ plan, activeFloorId: floorId, _history: [], _historyIdx: -1 })
  },

  // ── Machines ─────────────────────────────────────────────────────────────

  createMachine: async (m) => {
    const created = await fetch('/api/machines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m),
    }).then(r => r.json())
    set(st => ({ machines: [...st.machines, created].sort((a, b) => a.name.localeCompare(b.name)) }))
  },

  updateMachine: async (id, m) => {
    const updated = await fetch(`/api/machines/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m),
    }).then(r => r.json())
    set(st => ({ machines: st.machines.map(x => x.id === id ? updated : x) }))
    set(st => ({
      plan: st.plan ? {
        ...st.plan,
        placed_machines: st.plan.placed_machines.map(pm =>
          pm.machine_id === id ? { ...pm, name: updated.name, ip: updated.ip, type: updated.type } : pm
        ),
      } : st.plan,
    }))
  },

  deleteMachine: async (id) => {
    await fetch(`/api/machines/${id}`, { method: 'DELETE' })
    set(st => ({
      machines: st.machines.filter(x => x.id !== id),
      plan: st.plan ? { ...st.plan, placed_machines: st.plan.placed_machines.filter(pm => pm.machine_id !== id) } : st.plan,
    }))
  },

  // ── Floors ───────────────────────────────────────────────────────────────

  createFloor: async (name) => {
    const created = await fetch('/api/floors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, position: get().floors.length }),
    }).then(r => r.json())
    set(st => ({ floors: [...st.floors, created] }))
    await get().loadFloorPlan(created.id)
    return created.id
  },

  updateFloor: async (id, name, position) => {
    const updated = await fetch(`/api/floors/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, position }),
    }).then(r => r.json())
    set(st => ({ floors: st.floors.map(f => f.id === id ? updated : f) }))
  },

  deleteFloor: async (id) => {
    await fetch(`/api/floors/${id}`, { method: 'DELETE' })
    const floors = get().floors.filter(f => f.id !== id)
    set({ floors })
    if (get().activeFloorId === id) {
      if (floors.length > 0) await get().loadFloorPlan(floors[0].id)
      else set({ plan: null, activeFloorId: null })
    }
  },

  // ── Plan cells (erase only) ────────────────────────────────────────────────

  pushHistory: () => {
    const { plan, _history, _historyIdx } = get()
    if (!plan) return
    const snapshot: PlanSnapshot = {
      cells: { ...plan.cells },
      labels: plan.labels.map(l => ({ ...l })),
      borders: { ...plan.borders },
      rects: plan.rects.map(r => ({ ...r })),
    }
    const trimmed = _history.slice(0, _historyIdx + 1)
    trimmed.push(snapshot)
    if (trimmed.length > 60) trimmed.shift()
    set({ _history: trimmed, _historyIdx: trimmed.length - 1 })
  },

  paintCell: (row, col) => {
    const { plan, tool } = get()
    if (!plan || tool !== 'erase') return
    const key = `${row},${col}`
    const cells = { ...plan.cells }
    delete cells[key]

    // Remove rects covering this cell, recalculate all borders from remaining rects
    let rects = plan.rects
    let borders = plan.borders
    const filtered = rects.filter(r =>
      !(row >= r.row && row < r.row + r.height && col >= r.col && col < r.col + r.width)
    )
    if (filtered.length !== rects.length) {
      rects = filtered
      borders = {}
      for (const r of rects) {
        for (const k of getRectBorderKeys(r)) borders[k] = true
      }
      saveRectsDebounced(get)
      saveBordersDebounced(get)
    }

    set(st => ({ plan: st.plan ? { ...st.plan, cells, borders, rects } : st.plan }))
  },

  saveCells: () => {
    if (cellTimer) clearTimeout(cellTimer)
    cellTimer = setTimeout(() => {
      const { plan } = get()
      if (!plan) return
      fetch(`/api/floors/${plan.floor_id}/plan/cells`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cells: plan.cells }),
      }).catch(console.error)
    }, 600)
  },

  // ── Plan labels ───────────────────────────────────────────────────────────

  upsertLabel: (label) => {
    set(st => {
      if (!st.plan) return st
      const exists = st.plan.labels.some(l => l.id === label.id)
      const labels = exists
        ? st.plan.labels.map(l => l.id === label.id ? label : l)
        : [...st.plan.labels, label]
      const plan = { ...st.plan, labels }
      if (labelTimer) clearTimeout(labelTimer)
      labelTimer = setTimeout(() => {
        fetch(`/api/floors/${plan.floor_id}/plan/labels`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labels: plan.labels }),
        }).catch(console.error)
      }, 600)
      return { plan }
    })
  },

  deleteLabel: (id) => {
    set(st => {
      if (!st.plan) return st
      const labels = st.plan.labels.filter(l => l.id !== id)
      const plan = { ...st.plan, labels }
      fetch(`/api/floors/${plan.floor_id}/plan/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels }),
      }).catch(console.error)
      return { plan }
    })
  },

  // ── Plan borders ──────────────────────────────────────────────────────────

  toggleBorder: (key) => {
    set(st => {
      if (!st.plan) return st
      const borders = { ...st.plan.borders }
      if (borders[key]) delete borders[key]
      else borders[key] = true
      const plan = { ...st.plan, borders }
      if (borderTimer) clearTimeout(borderTimer)
      borderTimer = setTimeout(() => {
        const { plan: currentPlan } = get()
        if (!currentPlan) return
        fetch(`/api/floors/${currentPlan.floor_id}/plan/borders`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ borders: currentPlan.borders }),
        }).catch(console.error)
      }, 600)
      return { plan }
    })
  },

  // ── Plan rects ────────────────────────────────────────────────────────────

  addRect: (rect) => {
    set(st => {
      if (!st.plan) return st
      const rects = [...st.plan.rects, rect]
      const borders = { ...st.plan.borders }
      for (const k of getRectBorderKeys(rect)) borders[k] = true
      const plan = { ...st.plan, rects, borders }
      saveRectsDebounced(get)
      saveBordersDebounced(get)
      return { plan }
    })
  },

  removeRect: (id) => {
    set(st => {
      if (!st.plan) return st
      const rects = st.plan.rects.filter(r => r.id !== id)
      const borders: Record<string, boolean> = {}
      for (const r of rects) {
        for (const k of getRectBorderKeys(r)) borders[k] = true
      }
      const plan = { ...st.plan, rects, borders }
      saveRectsDebounced(get)
      saveBordersDebounced(get)
      return { plan }
    })
  },

  // ── Placed machines ───────────────────────────────────────────────────────

  placeMachine: async (machineId, row, col) => {
    const { plan, machines } = get()
    if (!plan) return
    const res = await fetch(`/api/floors/${plan.floor_id}/plan/machines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine_id: machineId, row, col }),
    }).then(r => r.json())
    const m = machines.find(x => x.id === machineId)
    if (!m) return
    const placed = {
      id: res.id, machine_id: machineId, floor_id: plan.floor_id,
      row_pos: row, col_pos: col, name: m.name, type: m.type, ip: m.ip,
    }
    set(st => ({
      plan: st.plan ? {
        ...st.plan,
        placed_machines: [
          ...st.plan.placed_machines.filter(pm => pm.machine_id !== machineId),
          placed,
        ],
      } : st.plan,
    }))
  },

  removeMachine: async (machineId) => {
    const { plan } = get()
    if (!plan) return
    await fetch(`/api/floors/${plan.floor_id}/plan/machines/${machineId}`, { method: 'DELETE' })
    set(st => ({
      plan: st.plan ? {
        ...st.plan,
        placed_machines: st.plan.placed_machines.filter(pm => pm.machine_id !== machineId),
      } : st.plan,
    }))
  },

  updatePlanSize: async (width, height) => {
    const { plan } = get()
    if (!plan) return
    await fetch(`/api/floors/${plan.floor_id}/plan/size`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ width, height }),
    })
    set(st => ({ plan: st.plan ? { ...st.plan, width, height } : st.plan }))
  },

  // ── Undo / redo ───────────────────────────────────────────────────────────

  undo: () => {
    const { _history, _historyIdx, plan } = get()
    if (_historyIdx <= 0 || !plan) return
    const idx = _historyIdx - 1
    const snap = _history[idx]
    set({ plan: { ...plan, cells: snap.cells, labels: snap.labels, borders: snap.borders, rects: snap.rects }, _historyIdx: idx })
    fetch(`/api/floors/${plan.floor_id}/plan/cells`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cells: snap.cells }) }).catch(console.error)
    fetch(`/api/floors/${plan.floor_id}/plan/labels`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: snap.labels }) }).catch(console.error)
    fetch(`/api/floors/${plan.floor_id}/plan/borders`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ borders: snap.borders }) }).catch(console.error)
    fetch(`/api/floors/${plan.floor_id}/plan/rects`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rects: snap.rects }) }).catch(console.error)
  },

  redo: () => {
    const { _history, _historyIdx, plan } = get()
    if (_historyIdx >= _history.length - 1 || !plan) return
    const idx = _historyIdx + 1
    const snap = _history[idx]
    set({ plan: { ...plan, cells: snap.cells, labels: snap.labels, borders: snap.borders, rects: snap.rects }, _historyIdx: idx })
    fetch(`/api/floors/${plan.floor_id}/plan/cells`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cells: snap.cells }) }).catch(console.error)
    fetch(`/api/floors/${plan.floor_id}/plan/labels`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: snap.labels }) }).catch(console.error)
    fetch(`/api/floors/${plan.floor_id}/plan/borders`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ borders: snap.borders }) }).catch(console.error)
    fetch(`/api/floors/${plan.floor_id}/plan/rects`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rects: snap.rects }) }).catch(console.error)
  },

  // ── SSH ───────────────────────────────────────────────────────────────────

  openSSH: async (machineId) => {
    return fetch(`/api/ssh/${machineId}`, { method: 'POST' }).then(r => r.json())
  },
}))
