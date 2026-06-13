import { useState } from 'react'
import { useStore } from '../store'
import { Machine, MACHINE_ICONS, MACHINE_TYPES } from '../types'
import MachineModal from '../components/MachineModal'
import SshTerminalModal from '../components/SshTerminalModal'

export default function InventoryView() {
  const [searchQuery, setSearchQuery] = useState('')
  const { machines, statuses, deleteMachine } = useStore()
  const [editingMachine, setEditingMachine] = useState<Partial<Machine> | null>(null)
  const [sshMachine, setSshMachine] = useState<Machine | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)

  const showNotif = (msg: string, ok = true) => {
    setNotif({ msg, ok })
    setTimeout(() => setNotif(null), 3000)
  }

  const q = searchQuery.toLowerCase()
  const filtered = machines.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(q) || m.ip.includes(q) || m.type.includes(q)
    const matchType = typeFilter === 'all' || m.type === typeFilter
    return matchSearch && matchType
  })

  const onlineCount = machines.filter(m => statuses[m.id] === true).length
  const offlineCount = machines.filter(m => statuses[m.id] === false).length

  return (
    <div className="flex flex-col h-full bg-gray-900 p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-white">Inventaire</h1>
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{onlineCount} en ligne</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{offlineCount} hors ligne</span>
            <span className="text-gray-500">{machines.length} total</span>
          </div>
        </div>
        <button
          onClick={() => setEditingMachine({})}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >+ Nouvelle machine</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Rechercher par nom, IP..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">Tous les types</option>
          {MACHINE_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 sticky top-0">
            <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Auth SSH</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-500 py-12 italic">
                {machines.length === 0 ? 'Aucune machine — cliquez sur "+ Nouvelle machine"' : 'Aucun résultat'}
              </td></tr>
            )}
            {filtered.map((m, i) => {
              const status = statuses[m.id]
              const dot = status === undefined ? '#9ca3af' : status ? '#22c55e' : '#ef4444'
              const label = status === undefined ? 'Inconnu' : status ? 'En ligne' : 'Hors ligne'
              return (
                <tr key={m.id} className={`border-t border-gray-700 hover:bg-gray-800/50 ${i % 2 === 0 ? '' : 'bg-gray-800/20'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dot }} />
                      <span className="text-xs" style={{ color: dot }}>{label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-white">
                    <span className="mr-2">{MACHINE_ICONS[m.type]}</span>{m.name}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {MACHINE_TYPES.find(t => t.value === m.type)?.label ?? m.type}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-300 text-xs">{m.ip || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {m.ssh_auth_type === 'key' ? '🔑 Clé' : '🔒 Mot de passe'}
                    {' '}<span className="text-gray-500">{m.ssh_user}:{m.ssh_port}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{m.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {m.ip && (
                        <button onClick={() => setSshMachine(m)}
                          className="bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs">SSH</button>
                      )}
                      <button onClick={() => setEditingMachine(m)}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs">✎</button>
                      <button
                        onClick={() => { if (confirm(`Supprimer "${m.name}" ?`)) deleteMachine(m.id) }}
                        className="bg-red-800/60 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">✕</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editingMachine && (
        <MachineModal
          machine={editingMachine}
          onClose={() => setEditingMachine(null)}
          onSaved={() => { setEditingMachine(null); showNotif('Machine enregistrée') }}
        />
      )}

      {sshMachine && (
        <SshTerminalModal
          machineId={sshMachine.id}
          machineName={sshMachine.name}
          machineIp={sshMachine.ip || ''}
          onClose={() => setSshMachine(null)}
        />
      )}

      {notif && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${notif.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {notif.msg}
        </div>
      )}
    </div>
  )
}
