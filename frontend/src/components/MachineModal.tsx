import { useState } from 'react'
import { Machine, MachineType, MACHINE_TYPES } from '../types'
import { useStore } from '../store'

interface Props {
  machine: Partial<Machine>
  onClose: () => void
  onSaved: () => void
}

export default function MachineModal({ machine, onClose, onSaved }: Props) {
  const { createMachine, updateMachine } = useStore()
  const isEdit = Boolean(machine.id)

  const [name, setName] = useState(machine.name ?? '')
  const [type, setType] = useState(machine.type ?? 'pc')
  const [ip, setIp] = useState(machine.ip ?? '')
  const [sshUser, setSshUser] = useState(machine.ssh_user ?? 'root')
  const [sshPort, setSshPort] = useState(machine.ssh_port ?? 22)
  const [authType, setAuthType] = useState<'password' | 'key'>(machine.ssh_auth_type ?? 'password')
  const [sshKey, setSshKey] = useState(machine.ssh_key_path ?? '')
  const [sshPass, setSshPass] = useState(machine.ssh_password ?? '')
  const [notes, setNotes] = useState(machine.notes ?? '')
  const [color, setColor] = useState(machine.color ?? '#6b7280')
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim()) { setError('Le nom est requis'); return }
    const data = {
      name: name.trim(), type, ip: ip.trim(),
      ssh_user: sshUser.trim() || 'root',
      ssh_port: Number(sshPort) || 22,
      ssh_auth_type: authType,
      ssh_key_path: authType === 'key' ? sshKey.trim() : '',
      ssh_password: authType === 'password' ? sshPass : '',
      notes: notes.trim(),
      color,
    }
    try {
      if (isEdit && machine.id) await updateMachine(machine.id, data)
      else await createMachine(data)
      onSaved()
    } catch {
      setError('Erreur lors de la sauvegarde')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-96 border border-gray-600 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{isEdit ? 'Modifier la machine' : 'Nouvelle machine'}</h2>

        <div className="space-y-3">
          <Field label="Nom *" value={name} onChange={setName} placeholder="PC-01 / SRV-WEB..." />

          <div>
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as MachineType)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              {MACHINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <Field label="Adresse IP" value={ip} onChange={setIp} placeholder="192.168.1.10" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Utilisateur SSH" value={sshUser} onChange={setSshUser} placeholder="root" />
            <div>
              <label className="block text-xs text-gray-400 mb-1">Port SSH</label>
              <input type="number" min={1} max={65535} value={sshPort} onChange={e => setSshPort(Number(e.target.value))}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Authentification SSH</label>
            <div className="flex gap-2">
              {(['password', 'key'] as const).map(at => (
                <button key={at} onClick={() => setAuthType(at)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${authType === at ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}>
                  {at === 'password' ? '🔒 Mot de passe' : '🔑 Clé SSH'}
                </button>
              ))}
            </div>
          </div>

          {authType === 'password' ? (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Mot de passe SSH</label>
              <input type="password" value={sshPass} onChange={e => setSshPass(e.target.value)}
                placeholder="Laissez vide pour saisie interactive"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              <p className="text-[10px] text-gray-500 mt-1">Stocké localement. Nécessite sshpass si rempli.</p>
            </div>
          ) : (
            <Field label="Chemin vers la clé SSH" value={sshKey} onChange={setSshKey} placeholder="/home/user/.ssh/id_rsa" />
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Couleur (catégorie)</label>
            <div className="flex items-center gap-2 flex-wrap">
              {['#6b7280','#3b82f6','#22c55e','#ef4444','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#14b8a6'].map(c => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width: 22, height: 22, borderRadius: 4, backgroundColor: c, flexShrink: 0,
                  outline: color === c ? '2px solid white' : '2px solid transparent',
                  outlineOffset: 1,
                }} />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                style={{ width: 22, height: 22, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Informations supplémentaires..."
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={submit}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium">
            {isEdit ? 'Enregistrer' : 'Ajouter'}
          </button>
          <button onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm">Annuler</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input type="text" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
    </div>
  )
}
