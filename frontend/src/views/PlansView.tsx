import { useState } from 'react'
import { useStore } from '../store'
import Sidebar from '../components/Sidebar'
import FloorCanvas from '../components/FloorCanvas'

export default function PlansView() {
  const { plan, floors } = useStore()
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const showNotif = (msg: string, ok = true) => {
    setNotif({ msg, ok })
    setTimeout(() => setNotif(null), 3000)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && <Sidebar showNotif={showNotif} />}

      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={sidebarOpen ? 'Masquer le panneau' : 'Afficher le panneau'}
        className="flex-shrink-0 w-4 bg-gray-700 hover:bg-gray-600 border-x border-gray-600 flex items-center justify-center transition-colors group"
      >
        <span className="text-gray-500 group-hover:text-white text-[10px] leading-none">
          {sidebarOpen ? '◀' : '▶'}
        </span>
      </button>

      {!plan && floors.length === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-gray-950 text-gray-500 text-sm italic">
          Aucun étage — ajoutez-en un dans la barre latérale
        </div>
      ) : plan ? (
        <FloorCanvas showNotif={showNotif} />
      ) : null}

      {notif && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${notif.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {notif.msg}
        </div>
      )}
    </div>
  )
}
