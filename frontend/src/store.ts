import { create } from 'zustand'
import { Machine, Floor, FloorPlan } from './types'

interface AppStore {
  machines: Machine[]
  floors: Floor[]
  plan: FloorPlan | null
  statuses: Record<string, boolean | undefined>

  view: 'inventory' | 'plans'
  activeFloorId: string | null
  zoom: number

  setView: (v: 'inventory' | 'plans') => void
  setZoom: (z: number) => void
  updateStatuses: (s: Record<string, boolean>) => void

  loadAll: () => Promise<void>
  loadFloorPlan: (floorId: string) => Promise<void>

  createMachine: (m: Omit<Machine, 'id'>) => Promise<void>
  updateMachine: (id: string, m: Omit<Machine, 'id'>) => Promise<void>
  deleteMachine: (id: string) => Promise<void>

  createFloor: (name: string) => Promise<string>
  updateFloor: (id: string, name: string, position: number) => Promise<void>
  deleteFloor: (id: string) => Promise<void>

  uploadImage: (file: File, floorId?: string) => Promise<void>
  placeMachine: (machineId: string, x: number, y: number) => Promise<void>
  moveMachine: (machineId: string, x: number, y: number) => void
  saveMachinePosition: (machineId: string) => Promise<void>
  scaleMachine: (machineId: string, scale: number) => void
  saveMachineScale: (machineId: string) => Promise<void>
  removeMachine: (machineId: string) => Promise<void>

  openSSH: (machineId: string) => Promise<{ ok?: boolean; terminal?: string; error?: string }>
}

export const useStore = create<AppStore>((set, get) => ({
  machines: [],
  floors: [],
  plan: null,
  statuses: {},
  view: 'plans',
  activeFloorId: null,
  zoom: 1,

  setView: (v) => set({ view: v }),
  setZoom: (z) => set({ zoom: Math.max(0.3, Math.min(4, z)) }),
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
    plan.placed_machines = plan.placed_machines ?? []
    set({ plan, activeFloorId: floorId })
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
    set(st => ({
      machines: st.machines.map(x => x.id === id ? updated : x),
      plan: st.plan ? {
        ...st.plan,
        placed_machines: st.plan.placed_machines.map(pm =>
          pm.machine_id === id
            ? { ...pm, name: updated.name, ip: updated.ip, type: updated.type, color: updated.color }
            : pm
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

  // ── Image upload ──────────────────────────────────────────────────────────

  uploadImage: async (file, floorId) => {
    const fid = floorId ?? get().plan?.floor_id
    if (!fid) return
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/floors/${fid}/plan/image`, {
      method: 'POST', body: form,
    }).then(r => r.json())
    if (fid === get().plan?.floor_id) {
      set(st => ({ plan: st.plan ? { ...st.plan, image_url: res.url } : st.plan }))
    }
  },

  // ── Placed machines ───────────────────────────────────────────────────────

  placeMachine: async (machineId, x, y) => {
    const { plan, machines } = get()
    if (!plan) return
    const res = await fetch(`/api/floors/${plan.floor_id}/plan/machines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine_id: machineId, x, y }),
    }).then(r => r.json())
    const m = machines.find(x => x.id === machineId)
    if (!m) return
    const placed = { id: res.id, machine_id: machineId, floor_id: plan.floor_id, x, y, scale: 1, name: m.name, type: m.type, ip: m.ip, color: m.color }
    set(st => ({
      plan: st.plan ? {
        ...st.plan,
        placed_machines: [...st.plan.placed_machines.filter(pm => pm.machine_id !== machineId), placed],
      } : st.plan,
    }))
  },

  moveMachine: (machineId, x, y) => {
    set(st => ({
      plan: st.plan ? {
        ...st.plan,
        placed_machines: st.plan.placed_machines.map(pm =>
          pm.machine_id === machineId ? { ...pm, x, y } : pm
        ),
      } : st.plan,
    }))
  },

  saveMachinePosition: async (machineId) => {
    const { plan } = get()
    if (!plan) return
    const pm = plan.placed_machines.find(p => p.machine_id === machineId)
    if (!pm) return
    await fetch(`/api/floors/${plan.floor_id}/plan/machines/${machineId}/position`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: pm.x, y: pm.y }),
    }).catch(console.error)
  },

  scaleMachine: (machineId, scale) => {
    set(st => ({
      plan: st.plan ? {
        ...st.plan,
        placed_machines: st.plan.placed_machines.map(pm =>
          pm.machine_id === machineId ? { ...pm, scale: Math.max(0.5, Math.min(3, scale)) } : pm
        ),
      } : st.plan,
    }))
  },

  saveMachineScale: async (machineId) => {
    const { plan } = get()
    if (!plan) return
    const pm = plan.placed_machines.find(p => p.machine_id === machineId)
    if (!pm) return
    await fetch(`/api/floors/${plan.floor_id}/plan/machines/${machineId}/scale`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scale: pm.scale }),
    }).catch(console.error)
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

  // ── SSH ───────────────────────────────────────────────────────────────────

  openSSH: async (machineId) => {
    return fetch(`/api/ssh/${machineId}`, { method: 'POST' }).then(r => r.json())
  },
}))
