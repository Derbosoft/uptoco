import { useState } from 'react'
import { useStore } from '../store'
import { Tool, MACHINE_ICONS } from '../types'
import MachineModal from './MachineModal'
import FloorModal from './FloorModal'

const TOOLS: { id: Tool; icon: string; title: string }[] = [
  { id: 'select', icon: '↖', title: 'Sélection / déplacer machines' },
  { id: 'rect', icon: '▭', title: 'Tracer un rectangle de zone (contour auto)' },
  { id: 'erase', icon: '✕', title: 'Effacer' },
]

const TOOL_HINT: Record<Tool, string> = {
  select: 'Cliquer / déplacer',
  rect: 'Cliquer-glisser pour tracer',
  erase: 'Cliquer pour effacer',
}

const RECT_COLORS = [
  '#DBEAFE', '#FEF9C3', '#D1FAE5', '#FCE7F3', '#E0E7FF',
  '#FEE2E2', '#FEF3C7', '#ECFDF5', '#F3F4F6', '#FFF7ED',
  '#374151', '#1f2937',
]

interface Props {
  showNotif: (msg: string, ok?: boolean) => void
}

export default function Sidebar({ showNotif }: Props) {
  const {
    floors, activeFloorId, plan, tool, toolColor, machines, statuses,
    setTool, setToolColor, loadFloorPlan, deleteFloor, removeMachine, updatePlanSize,
  } = useStore()

  const [showFloorModal, setShowFloorModal] = useState<{ id?: string; name?: string } | null>(null)
  const [showMachineModal, setShowMachineModal] = useState(false)
  const [machineSearch, setMachineSearch] = useState('')

  const filteredMachines = machines.filter(m => {
    const q = machineSearch.toLowerCase()
    return m.name.toLowerCase().includes(q) || m.ip.includes(q)
  })

  return (
    <div className="w-60 flex-shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col overflow-hidden">

      {/* Floor selector */}
      <div className="px-3 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Étage</span>
          <button onClick={() => setShowFloorModal({})} className="text-xs text-blue-400 hover:text-blue-300">+ Ajouter</button>
        </div>
        {floors.length === 0 && <p className="text-xs text-gray-500 italic">Aucun étage</p>}
        {floors.map(f => (
          <div key={f.id} className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer group ${activeFloorId === f.id ? 'bg-blue-700' : 'hover:bg-gray-700'}`}
            onClick={() => loadFloorPlan(f.id)}>
            <span className="text-sm truncate">{f.name}</span>
            <div className="hidden group-hover:flex gap-1">
              <button onClick={e => { e.stopPropagation(); setShowFloorModal({ id: f.id, name: f.name }) }}
                className="text-[10px] text-gray-400 hover:text-white px-1">✎</button>
              <button onClick={e => { e.stopPropagation(); if (confirm(`Supprimer "${f.name}" ?`)) deleteFloor(f.id) }}
                className="text-[10px] text-red-500 hover:text-red-400 px-1">✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Tools */}
      <div className="px-3 py-3 border-b border-gray-700">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Outils</div>
        <div className="flex gap-1">
          {TOOLS.map(t => (
            <button key={t.id} title={t.title} onClick={() => setTool(t.id)}
              className={`flex-1 h-9 rounded text-sm font-bold transition-colors ${tool === t.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {t.icon}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-gray-500 mt-1 text-center">{TOOL_HINT[tool]}</div>

        {/* Color picker — only for rect tool */}
        {tool === 'rect' && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            <div className="text-[10px] text-gray-500 mb-1.5">Couleur du rectangle</div>
            <div className="flex flex-wrap gap-1.5">
              {RECT_COLORS.map(c => (
                <button key={c} onClick={() => setToolColor(c)} style={{
                  backgroundColor: c, width: 20, height: 20, borderRadius: 3, flexShrink: 0,
                  outline: toolColor === c ? '2px solid #3b82f6' : '1px solid #4b5563',
                  outlineOffset: 1,
                }} />
              ))}
              <input type="color" value={toolColor} onChange={e => setToolColor(e.target.value)}
                style={{ width: 20, height: 20, padding: 0, border: 'none', borderRadius: 3, cursor: 'pointer', flexShrink: 0 }} />
            </div>
          </div>
        )}
      </div>

      {/* Grid size */}
      {plan && (
        <div className="px-3 py-3 border-b border-gray-700">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Taille de la grille</div>
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <label className="flex items-center gap-1">
              L
              <input type="number" min={5} max={80} value={plan.width}
                onChange={e => updatePlanSize(Number(e.target.value), plan.height)}
                className="w-14 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500" />
            </label>
            <span className="text-gray-600">×</span>
            <label className="flex items-center gap-1">
              H
              <input type="number" min={5} max={60} value={plan.height}
                onChange={e => updatePlanSize(plan.width, Number(e.target.value))}
                className="w-14 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500" />
            </label>
          </div>
        </div>
      )}

      {/* Machines inventory */}
      <div className="flex-1 flex flex-col min-h-0 px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Machines</span>
          <button onClick={() => setShowMachineModal(true)} className="text-xs text-blue-400 hover:text-blue-300">+ Ajouter</button>
        </div>
        <input type="text" placeholder="Filtrer..." value={machineSearch} onChange={e => setMachineSearch(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 mb-2 focus:outline-none focus:border-blue-500" />
        <div className="flex-1 overflow-y-auto space-y-0.5">
          {filteredMachines.length === 0 && <p className="text-xs text-gray-500 italic">Aucune machine</p>}
          {filteredMachines.map(m => {
            const status = statuses[m.id]
            const dot = status === undefined ? '#9ca3af' : status ? '#22c55e' : '#ef4444'
            const isPlaced = plan?.placed_machines.some(pm => pm.machine_id === m.id)
            return (
              <div key={m.id} draggable onDragStart={e => { e.dataTransfer.setData('machine_id', m.id) }}
                className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-700 cursor-grab group">
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dot, flexShrink: 0 }} />
                <span className="text-sm">{MACHINE_ICONS[m.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate flex items-center gap-1">
                    {m.name}
                    {isPlaced && <span className="text-[9px] text-green-500 font-normal">• placé</span>}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">{m.ip || '—'}</div>
                </div>
                {isPlaced && (
                  <button onClick={() => removeMachine(m.id)} title="Retirer du plan"
                    className="hidden group-hover:block text-[10px] text-gray-500 hover:text-red-400">✕</button>
                )}
              </div>
            )
          })}
        </div>
        {plan && <p className="text-[10px] text-gray-500 mt-1">Glisser une machine sur la grille</p>}
      </div>

      {/* Modals */}
      {showFloorModal && (
        <FloorModal id={showFloorModal.id} initialName={showFloorModal.name}
          onClose={() => setShowFloorModal(null)}
          onSaved={(msg) => { setShowFloorModal(null); showNotif(msg) }} />
      )}
      {showMachineModal && (
        <MachineModal machine={{}} onClose={() => setShowMachineModal(false)}
          onSaved={() => { setShowMachineModal(false); showNotif('Machine ajoutée') }} />
      )}
    </div>
  )
}
