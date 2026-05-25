import { useRef } from 'react'
import { useStore } from '../store'

export default function TopNav() {
  const { view, setView, undo, redo, _historyIdx, _history, plan, setZoom, zoom, machines, statuses, loadAll } = useStore()
  const importRef = useRef<HTMLInputElement>(null)

  const canUndo = _historyIdx > 0
  const canRedo = _historyIdx < _history.length - 1

  const online = machines.filter(m => statuses[m.id] === true).length
  const offline = machines.filter(m => statuses[m.id] === false).length
  const unknown = machines.filter(m => statuses[m.id] === undefined).length

  const handleExport = async () => {
    const data = await fetch('/api/export').then(r => r.json())
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `uptoco-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!confirm('Importer ce fichier ? Toutes les données actuelles seront remplacées.')) return
    const text = await file.text()
    const data = JSON.parse(text)
    await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await loadAll()
  }

  return (
    <div className="flex items-center h-11 bg-gray-800 border-b border-gray-700 px-4 gap-3 flex-shrink-0">
      <span className="font-bold text-blue-400 text-sm tracking-wide mr-1">UpToco</span>

      <div className="flex gap-1">
        {(['inventory', 'plans'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              view === v ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {v === 'inventory' ? '📋 Inventaire' : '🗺 Plans'}
          </button>
        ))}
      </div>

      {/* Status counters */}
      {machines.length > 0 && (
        <>
          <div className="w-px h-5 bg-gray-600 mx-0.5" />
          <div className="flex items-center gap-2 text-xs">
            <span title={`${online} machine(s) en ligne`} className="flex items-center gap-1 text-green-400">
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
              {online}
            </span>
            <span title={`${offline} machine(s) hors ligne`} className="flex items-center gap-1 text-red-400">
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
              {offline}
            </span>
            {unknown > 0 && (
              <span title={`${unknown} machine(s) statut inconnu`} className="flex items-center gap-1 text-gray-500">
                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#6b7280', display: 'inline-block' }} />
                {unknown}
              </span>
            )}
          </div>
        </>
      )}

      {view === 'plans' && (
        <>
          <div className="w-px h-5 bg-gray-600 mx-0.5" />
          <div className="flex items-center gap-1">
            <button
              onClick={undo} disabled={!canUndo}
              title="Annuler"
              className={`px-2 py-1 rounded text-xs transition-colors ${canUndo ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 cursor-not-allowed'}`}
            >↩ Annuler</button>
            <button
              onClick={redo} disabled={!canRedo}
              title="Rétablir"
              className={`px-2 py-1 rounded text-xs transition-colors ${canRedo ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 cursor-not-allowed'}`}
            >↪ Rétablir</button>
          </div>
          <div className="w-px h-5 bg-gray-600 mx-0.5" />
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(zoom - 0.1)} className="px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-700">−</button>
            <span className="text-xs text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(zoom + 0.1)} className="px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-700">+</button>
            <button onClick={() => setZoom(1)} className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-700 hover:text-gray-300">1:1</button>
          </div>
          {plan && (
            <>
              <div className="w-px h-5 bg-gray-600 mx-0.5" />
              <button
                onClick={async () => {
                  const { default: html2canvas } = await import('html2canvas')
                  const el = document.getElementById('floor-grid')
                  if (!el) return
                  const canvas = await html2canvas(el, { backgroundColor: '#f9fafb', scale: 2 })
                  const a = document.createElement('a')
                  a.href = canvas.toDataURL('image/png')
                  a.download = 'plan.png'
                  a.click()
                }}
                className="px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-700"
                title="Exporter le plan en PNG"
              >⬇ PNG</button>
            </>
          )}
        </>
      )}

      {/* Export / Import — always visible */}
      <div className="ml-auto flex items-center gap-1">
        <div className="w-px h-5 bg-gray-600 mx-0.5" />
        <button
          onClick={handleExport}
          className="px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-700"
          title="Exporter toutes les données en JSON"
        >⬇ Export</button>
        <button
          onClick={() => importRef.current?.click()}
          className="px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-700"
          title="Importer des données depuis un fichier JSON"
        >⬆ Import</button>
        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
      </div>
    </div>
  )
}
