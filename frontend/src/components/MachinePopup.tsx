import { useEffect, useRef, useState } from 'react'
import { PlacedMachine } from '../types'
import { useStore } from '../store'
import MachineModal from './MachineModal'
import SshTerminalModal from './SshTerminalModal'

interface Props {
  placed: PlacedMachine
  position: { x: number; y: number } | null
  onClose: () => void
  showNotif: (msg: string, ok?: boolean) => void
}

export default function MachinePopup({ placed, position, onClose, showNotif }: Props) {
  const { statuses, machines, removeMachine } = useStore()
  const [editOpen, setEditOpen]       = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const machine = machines.find(m => m.id === placed.machine_id)
  const status  = statuses[placed.machine_id]
  const dot     = status === undefined ? '#9ca3af' : status ? '#22c55e' : '#ef4444'
  const label   = status === undefined ? 'Inconnu'  : status ? 'En ligne' : 'Hors ligne'

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (editOpen || terminalOpen) return
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, editOpen, terminalOpen])

  const style: React.CSSProperties = position
    ? {
        position: 'fixed',
        top:  Math.min(position.y, window.innerHeight - 260),
        left: Math.min(position.x + 12, window.innerWidth - 240),
        zIndex: 50,
      }
    : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 50 }

  if (terminalOpen) {
    return (
      <SshTerminalModal
        machineId={placed.machine_id}
        machineName={placed.name}
        machineIp={placed.ip || ''}
        onClose={() => { setTerminalOpen(false); onClose() }}
      />
    )
  }

  return (
    <>
      <div ref={ref} style={style} onClick={e => e.stopPropagation()}>
        <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-4 w-52">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-bold text-white text-sm">{placed.name}</div>
              <div className="text-xs text-gray-400 font-mono">{placed.ip || '—'}</div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none ml-1">×</button>
          </div>

          <div className="flex items-center gap-2 mb-3 bg-gray-700/50 rounded-lg px-3 py-2">
            <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: dot, boxShadow: `0 0 5px ${dot}` }} />
            <span className="text-xs font-medium" style={{ color: dot }}>{label}</span>
          </div>

          {machine && (
            <div className="text-xs text-gray-500 mb-3 space-y-0.5">
              <div>Auth : <span className="text-gray-300">{machine.ssh_auth_type === 'key' ? '🔑 Clé' : '🔒 MDP'}</span></div>
              <div>User : <span className="text-gray-300">{machine.ssh_user}:{machine.ssh_port}</span></div>
              {machine.notes && <div className="text-gray-600 italic truncate">{machine.notes}</div>}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setTerminalOpen(true)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-2"
            >
              ⌨ Connexion SSH
            </button>
            <div className="flex gap-2">
              <button onClick={() => setEditOpen(true)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-1.5 text-xs">Modifier</button>
              <button onClick={() => { removeMachine(placed.machine_id); onClose() }}
                className="flex-1 bg-red-800/60 hover:bg-red-700 text-white rounded-lg py-1.5 text-xs" title="Retirer du plan">
                Retirer
              </button>
            </div>
          </div>
        </div>
      </div>

      {editOpen && machine && (
        <MachineModal
          machine={machine}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); showNotif('Machine mise à jour') }}
        />
      )}
    </>
  )
}
